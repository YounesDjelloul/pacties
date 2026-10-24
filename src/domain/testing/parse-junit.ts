import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type { TestCase } from '@/domain/testing/types';

type XmlNode = Record<string, unknown>;

const REPEATED_ELEMENTS = new Set(['testsuite', 'testcase', 'failure', 'error', 'skipped']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => REPEATED_ELEMENTS.has(name),
});

export function parseJunit(xml: string): Result<TestCase[]> {
  if (xml.trim().length === 0) {
    return fail('The test run produced an empty JUnit report');
  }
  if (XMLValidator.validate(xml) !== true) {
    return fail('The test run produced a JUnit report that is not valid XML; the test command probably crashed before finishing');
  }

  const root = parser.parse(xml) as XmlNode;
  const top = asNode(root['testsuites']) ?? root;
  return ok(collectSuites(top, ''));
}

function collectSuites(node: XmlNode, parentName: string): TestCase[] {
  const suites = asNodes(node['testsuite']);
  return suites.flatMap((suite) => {
    const name = joinNames(parentName, text(suite['name']));
    return [...asNodes(suite['testcase']).map((testCase) => toTestCase(testCase, name)), ...collectSuites(suite, name)];
  });
}

function toTestCase(node: XmlNode, suiteName: string): TestCase {
  const problem = asNodes(node['failure'])[0] ?? asNodes(node['error'])[0] ?? null;
  const skipped = node['skipped'] !== undefined;
  const status = problem !== null || node['failure'] !== undefined || node['error'] !== undefined ? 'failed' : skipped ? 'skipped' : 'passed';
  return {
    name: text(node['name']),
    suite: joinNames(suiteName, text(node['classname'])),
    status,
    message: problem === null ? null : nonEmpty(text(problem['message'])) ?? firstLine(text(problem['text'])),
    details: problem === null ? null : nonEmpty(text(problem['text'])),
  };
}

function asNodes(value: unknown): XmlNode[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === 'object' && item !== null ? (item as XmlNode) : { text: String(item) }));
}

function asNode(value: unknown): XmlNode | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as XmlNode) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function nonEmpty(value: string): string | null {
  return value.trim().length === 0 ? null : value;
}

function firstLine(value: string): string | null {
  return nonEmpty(value.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? '');
}

function joinNames(parent: string, child: string): string {
  if (parent.length === 0 || parent === child) {
    return child;
  }
  return child.length === 0 ? parent : `${parent} > ${child}`;
}
