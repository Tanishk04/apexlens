/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { Highlighted } from '../app/components/Highlighted';

describe('Highlighted', () => {
  it('renders plain text with no query', () => {
    render(<Highlighted text="Account.recalculate()" query="" caseSensitive={false} active={false} />);
    expect(screen.getByText('Account.recalculate()')).toBeTruthy();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('wraps every match in a <mark>, preserving surrounding text', () => {
    render(<Highlighted text="foo bar foo" query="foo" caseSensitive={false} active={false} />);
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    marks.forEach((m) => expect(m.textContent).toBe('foo'));
    expect(document.body.textContent).toBe('foo bar foo');
  });

  it('styles the active match differently from inactive matches', () => {
    const { rerender } = render(
      <Highlighted text="match" query="match" caseSensitive={false} active={true} />,
    );
    expect(document.querySelector('mark')!.className).toContain('bg-warn text-background');

    rerender(<Highlighted text="match" query="match" caseSensitive={false} active={false} />);
    expect(document.querySelector('mark')!.className).toContain('bg-warn/40 text-foreground');
  });

  it('respects caseSensitive', () => {
    render(<Highlighted text="Foo foo" query="foo" caseSensitive={true} active={false} />);
    expect(document.querySelectorAll('mark')).toHaveLength(1);
    expect(document.querySelector('mark')!.textContent).toBe('foo');
  });

  it('applies className to non-matching segments only', () => {
    render(
      <Highlighted text="foo bar" query="foo" caseSensitive={false} active={false} className="text-soql" />,
    );
    const nonMatch = screen.getByText('bar', { exact: false });
    expect(nonMatch.className).toBe('text-soql');
    expect(document.querySelector('mark')!.className).not.toContain('text-soql');
  });
});
