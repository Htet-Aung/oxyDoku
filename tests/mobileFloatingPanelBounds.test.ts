import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { computeClampedOffset, MobileFloatingPanel } from '../src/ui/mobile/MobileFloatingPanel';

describe('Mobile Floating Panel Boundary & Clamping Tests', () => {
  const containerRect = {
    top: 50,
    bottom: 650,
    left: 0,
    right: 400,
    width: 400,
    height: 600
  };
  const safeMargin = 8;
  const safeTop = 50 + 8; // 58
  const safeBottom = 650 - 8; // 642
  const safeLeft = 0 + 8; // 8
  const safeRight = 400 - 8; // 392

  it('allows dragging within safe bounds without altering target offset', () => {
    // Panel positioned at bottom with margin 8
    // baseTop = 642 - 200 = 442, baseBottom = 642
    // baseLeft = 8, baseRight = 392
    const panelRect = {
      top: 442,
      bottom: 642,
      left: 8,
      right: 392,
      width: 384,
      height: 200
    };
    const currentOffset = { x: 0, y: 0 };
    const targetOffset = { x: 0, y: -100 }; // 100px up

    const clamped = computeClampedOffset({
      panelRect,
      containerRect,
      currentOffset,
      targetOffset,
      safeMargin
    });

    expect(clamped).toEqual({ x: 0, y: -100 });
  });

  it('prevents moving the window outside the top of the screen', () => {
    // baseTop = 442. minY = safeTop - baseTop = 58 - 442 = -384.
    const panelRect = {
      top: 442,
      bottom: 642,
      left: 8,
      right: 392,
      width: 384,
      height: 200
    };
    const currentOffset = { x: 0, y: 0 };
    const targetOffset = { x: 0, y: -900 }; // Dragging way past the top

    const clamped = computeClampedOffset({
      panelRect,
      containerRect,
      currentOffset,
      targetOffset,
      safeMargin
    });

    // Must be clamped to -384 so top is exactly at safeTop (58)
    expect(clamped.y).toBe(-384);
    const resultingTop = panelRect.top + clamped.y;
    expect(resultingTop).toBe(safeTop);
  });

  it('prevents moving the window outside the bottom of the screen', () => {
    // baseBottom = 642. maxY = safeBottom - baseBottom = 642 - 642 = 0.
    const panelRect = {
      top: 442,
      bottom: 642,
      left: 8,
      right: 392,
      width: 384,
      height: 200
    };
    const currentOffset = { x: 0, y: 0 };
    const targetOffset = { x: 0, y: 300 }; // Dragging way below the bottom

    const clamped = computeClampedOffset({
      panelRect,
      containerRect,
      currentOffset,
      targetOffset,
      safeMargin
    });

    expect(clamped.y).toBe(0);
    const resultingBottom = panelRect.bottom + clamped.y;
    expect(resultingBottom).toBe(safeBottom);
  });

  it('prevents moving the window outside left or right edges', () => {
    // Tablet or wider screen where panel is 300px in a 500px container
    const wideContainer = {
      top: 0,
      bottom: 800,
      left: 0,
      right: 500,
      width: 500,
      height: 800
    };
    const panelRect = {
      top: 600,
      bottom: 792,
      left: 100,
      right: 400,
      width: 300,
      height: 192
    };
    const currentOffset = { x: 0, y: 0 };

    // Drag way left
    const clampedLeft = computeClampedOffset({
      panelRect,
      containerRect: wideContainer,
      currentOffset,
      targetOffset: { x: -600, y: 0 },
      safeMargin: 8
    });
    expect(clampedLeft.x).toBe(8 - 100); // -92
    expect(panelRect.left + clampedLeft.x).toBe(8);

    // Drag way right
    const clampedRight = computeClampedOffset({
      panelRect,
      containerRect: wideContainer,
      currentOffset,
      targetOffset: { x: 600, y: 0 },
      safeMargin: 8
    });
    expect(clampedRight.x).toBe(492 - 400); // 92
    expect(panelRect.right + clampedRight.x).toBe(492);
  });

  it('clamps position when expanding from a small window moved to the corner', () => {
    // User scenario:
    // 1. Panel is in pill mode (height 44px)
    // baseTop = 642 - 44 = 598.
    // User dragged pill all the way to top-right corner:
    // minY = 58 - 598 = -540.
    // Offset is { x: 50, y: -540 }.
    const pillOffset = { x: 50, y: -540 };

    // 2. User expands to 'expanded' (height 450px, width 384px spanning almost full container)
    // Untransformed base for expanded panel:
    // baseBottom = 642, baseTop = 642 - 450 = 192.
    // baseLeft = 8, baseRight = 392.
    // PanelRect at the moment of expansion with the old offset:
    const expandedPanelRect = {
      top: 192 + pillOffset.y, // 192 - 540 = -348 (offscreen!)
      bottom: 642 + pillOffset.y, // 642 - 540 = 102
      left: 8 + pillOffset.x, // 58
      right: 392 + pillOffset.x, // 442 (offscreen right!)
      width: 384,
      height: 450
    };

    // recheckBounds calls computeClampedOffset with currentOffset = pillOffset
    const clamped = computeClampedOffset({
      panelRect: expandedPanelRect,
      containerRect,
      currentOffset: pillOffset,
      targetOffset: pillOffset,
      safeMargin: 8
    });

    // New minY = safeTop - baseTop = 58 - 192 = -134.
    // Clamped Y must be -134 so that newTop = 192 + (-134) = 58 (safeTop)!
    expect(clamped.y).toBe(-134);
    const newTop = 192 + clamped.y;
    expect(newTop).toBe(safeTop);

    // New maxX = safeRight - baseRight = 392 - 392 = 0.
    // Clamped X must be 0 so that newRight = 392 + 0 = 392 (safeRight)!
    expect(clamped.x).toBe(0);
    const newRight = 392 + clamped.x;
    expect(newRight).toBe(safeRight);
  });

  it('pins the header at the safe top if panel is taller than container', () => {
    // Short screen (e.g. height 300px), panel height 350px
    const shortContainer = {
      top: 0,
      bottom: 300,
      left: 0,
      right: 400,
      width: 400,
      height: 300
    };
    const tallPanelRect = {
      top: -58,
      bottom: 292,
      left: 8,
      right: 392,
      width: 384,
      height: 350
    };

    const clamped = computeClampedOffset({
      panelRect: tallPanelRect,
      containerRect: shortContainer,
      currentOffset: { x: 0, y: 0 },
      targetOffset: { x: 0, y: 0 },
      safeMargin: 8
    });

    // safeTop is 8. baseTop is -58. minY = 8 - (-58) = 66.
    // Clamped Y must be 66 so panel top is at safeTop (8).
    expect(clamped.y).toBe(66);
    expect(tallPanelRect.top + clamped.y).toBe(8);
  });

  it('renders pill mode with reshape and close buttons', () => {
    const html = renderToString(
      React.createElement(MobileFloatingPanel, {
        activeTab: 'tools',
        initialSize: 'pill',
        onClose: () => {},
        onOpenTab: () => {},
        onLearn: () => {},
        onOpenMastery: () => {}
      })
    );

    expect(html).toContain('mobile-floating-pill-row');
    expect(html).toContain('mobile-floating-btn');
    expect(html).toContain('mobile-floating-pill-grip');
  });
});
