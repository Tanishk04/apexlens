import { isAllowedSalesforceDomain } from '../api/salesforce';

describe('isAllowedSalesforceDomain (confused-deputy guard)', () => {
  it('allows real Salesforce host patterns over https', () => {
    expect(isAllowedSalesforceDomain('https://foo.my.salesforce.com')).toBe(true);
    expect(isAllowedSalesforceDomain('https://foo.lightning.force.com')).toBe(true);
    expect(isAllowedSalesforceDomain('https://foo.my.salesforce-setup.com')).toBe(true);
    expect(isAllowedSalesforceDomain('https://foo.sandbox.my.salesforce.com')).toBe(true);
  });

  it('rejects an attacker-supplied domain', () => {
    expect(isAllowedSalesforceDomain('https://evil.example.com')).toBe(false);
    // Lookalike domain — "salesforce.com" only as a path/subdomain suffix trick.
    expect(isAllowedSalesforceDomain('https://salesforce.com.evil.example.com')).toBe(false);
    expect(isAllowedSalesforceDomain('https://not-salesforce.com')).toBe(false);
  });

  it('rejects non-https schemes even for a real host', () => {
    expect(isAllowedSalesforceDomain('http://foo.my.salesforce.com')).toBe(false);
  });

  it('fails closed on malformed input rather than throwing', () => {
    expect(isAllowedSalesforceDomain('not a url')).toBe(false);
    expect(isAllowedSalesforceDomain('')).toBe(false);
  });
});
