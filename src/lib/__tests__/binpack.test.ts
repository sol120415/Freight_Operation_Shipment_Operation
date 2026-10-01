import { describe, it, expect } from "vitest";
import {
  packIntoBins,
  itemVolumeCbm,
  cubicCmToCbm,
  utilizationPercent,
  type CargoItem,
  type BinSpec,
} from "@/lib/binpack";

const BIN: BinSpec = {
  id: "truck-a",
  label: "6-wheeler",
  lengthCm: 100,
  widthCm: 200,
  heightCm: 200, // 4 CBM
  maxWeightKg: 1_000,
};

const mk = (id: string, l: number, w: number, h: number, kg: number): CargoItem => ({
  id,
  lengthCm: l,
  widthCm: w,
  heightCm: h,
  weightKg: kg,
});

describe("binpack unit helpers", () => {
  it("converts cm^3 to cbm", () => {
    expect(cubicCmToCbm(1_000_000)).toBe(1);
  });

  it("uses explicit volume when provided", () => {
    const item = { ...mk("a", 10, 10, 10, 5), volumeCbm: 7 };
    expect(itemVolumeCbm(item)).toBe(7);
  });

  it("derives volume from dims otherwise", () => {
    expect(itemVolumeCbm(mk("a", 100, 100, 100, 5))).toBe(1);
  });
});

describe("packIntoBins first-fit-decreasing", () => {
  it("packs items that fit by volume", () => {
    const items = [mk("a", 100, 100, 100, 100)]; // 1 cbm
    const { packed, unpacked } = packIntoBins(items, [BIN]);
    expect(unpacked).toHaveLength(0);
    expect(packed).toHaveLength(1);
    expect(packed[0].items.map((i) => i.id)).toEqual(["a"]);
    expect(packed[0].usedCbm).toBeCloseTo(1, 5);
    expect(packed[0].usedWeightKg).toBe(100);
  });

  it("splits into multiple bins when capacity is exceeded", () => {
    // two 3cbm items each exceeding single-bin 4cbm combined
    const items = [mk("big1", 100, 100, 300, 100), mk("big2", 100, 100, 300, 100)];
    const { packed } = packIntoBins(items, [BIN, BIN]);
    expect(packed).toHaveLength(2);
    expect(packed[0].items).toHaveLength(1);
    expect(packed[1].items).toHaveLength(1);
  });

  it("respects weight ceilings", () => {
    const items = [
      mk("w1", 100, 100, 100, 800),
      mk("w2", 100, 100, 100, 800), // cannot share 1000kg bin
    ];
    const { packed, unpacked } = packIntoBins(items, [BIN]);
    expect(packed).toHaveLength(1);
    expect(packed[0].items).toHaveLength(1);
    expect(unpacked.map((i) => i.id)).toEqual(["w2"]);
  });

  it("reports oversized items as unpacked", () => {
    const items = [mk("huge", 200, 200, 200, 50)]; // 8 cbm > 4 cbm bin
    const { packed, unpacked } = packIntoBins(items, [BIN]);
    expect(packed).toHaveLength(0);
    expect(unpacked.map((i) => i.id)).toEqual(["huge"]);
  });

  it("returns utilization under 100%", () => {
    const { packed } = packIntoBins([mk("a", 50, 100, 100, 10)], [BIN]);
    const pct = utilizationPercent(packed[0]);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });
});
