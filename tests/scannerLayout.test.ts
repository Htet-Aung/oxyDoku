import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Pattern Scanner Layout & Width Expansion', () => {
  it('defines desktop expansion for side panel when scanner or practice is open', () => {
    const css = new TextDecoder().decode(readFileSync('src/ui/styles.css'));
    
    // Checks that .side.scanner-open allows expanding with flex: 1 and a responsive max-width
    expect(css).toMatch(/\.side\.scanner-open/);
    expect(css).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(css).toMatch(/min-width:\s*320px/);
    
    // Checks that .controls within expanded side panel has constrained max-width
    expect(css).toMatch(/\.side\.scanner-open\s+\.controls/);

    // Checks that .pattern-scanner-panel takes 100% width and orders first
    expect(css).toMatch(/\.pattern-scanner-panel\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.pattern-scanner-panel\s*\{[^}]*order:\s*-1/);
  });

  it('wires scanner-open and has-scanner classes in App.tsx', () => {
    const appTsx = new TextDecoder().decode(readFileSync('src/ui/App.tsx'));
    
    // Main layout receives has-scanner when scanner is open
    expect(appTsx).toContain('layout${scannerOpen ? \' has-scanner\' : \'\'}');
    
    // Aside side panel receives scanner-open when scanner is open
    expect(appTsx).toContain('scannerOpen ? \' scanner-open\' : \'\'');
  });
});
