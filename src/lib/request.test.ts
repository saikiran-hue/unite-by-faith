import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isUuid, readJsonObject } from './request';

const req = (body: string) => new NextRequest('http://x/api', { method: 'POST', body });

describe('isUuid', () => {
  it('accepts upper and lower case uuids', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111101')).toBe(true);
    expect(isUuid('ABCDEF01-1111-4111-8111-111111111101')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const v of ['', 'abc', '11111111-1111-4111-8111-11111111110', "x' or 1=1"]) expect(isUuid(v)).toBe(false);
  });
});

describe('readJsonObject', () => {
  it('parses an object', async () => {
    expect(await readJsonObject(req('{"a":1}'))).toEqual({ a: 1 });
  });
  it('returns null on bad JSON, arrays and scalars', async () => {
    for (const b of ['{bad', '[1]', '3', '']) expect(await readJsonObject(req(b))).toBeNull();
  });
});
