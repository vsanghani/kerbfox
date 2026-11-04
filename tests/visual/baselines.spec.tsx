import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { RankingResponse, SectionPayload, SuburbDetail } from "../../src/api/types";
import { CompareChart } from "../../src/components/CompareChart";
import { CookieBanner } from "../../src/components/CookieBanner";
import { FilterPills } from "../../src/components/FilterPills";
import { Icon } from "../../src/components/Icon";
import { MapCanvas } from "../../src/components/MapCanvas";
import { MetricSection } from "../../src/components/MetricSection";
import { MetricsBlock } from "../../src/components/MetricsBlock";
import { PageIntro } from "../../src/components/PageIntro";
import { RankTable } from "../../src/components/RankTable";
import { ScoreBlock } from "../../src/components/ScoreBlock";
import { SearchField } from "../../src/components/SearchField";
import { SectionNav } from "../../src/components/SectionNav";
import { SiteFooter } from "../../src/components/SiteFooter";
import { SiteHeader } from "../../src/components/SiteHeader";
import { SourceNote } from "../../src/components/SourceNote";
import { DatasetNotice, EmptyState, ErrorState, LoadingState } from "../../src/components/States";
import { TableScroll } from "../../src/components/TableScroll";
import { TrendChart } from "../../src/components/TrendChart";
import { FORMULA } from "../../src/config/formula";
import type { SectionConfig } from "../../src/metrics/registry";
import { expect, test } from "./harness";

const canopyConfig: SectionConfig = {
  id: "canopy-sample",
  nav: "Canopy",
  kicker: "Shade",
  title: "Tree canopy",
  lede: "Share of land under canopy.",
  kind: "metrics",
  slots: [{ id: "canopy-pct", label: "Canopy cover", unit: "%" }],
};

const canopyPayload: SectionPayload = {
  updated: "2024-06-01",
  narrative: null,
  source: {
    id: "canopy",
    name: "Canopy cover layer",
    agency: "State environment department",
    published: "2024-06-01",
    licence: "CC BY 4.0",
    url: null,
    note: "Share of land under canopy.",
  },
  metrics: [
    {
      id: "canopy-pct",
      label: "Canopy cover",
      group: null,
      value: 18.4,
      unit: "%",
      context_label: "Published layer",
      context_value: "2024-06-01",
      tier: null,
      note: null,
    },
  ],
  series: [],
  tables: [],
  places: [],
  notes: [],
};

function place(name: string, slug: string, values: number[]): SuburbDetail {
  return {
    state: "vic",
    slug,
    name,
    score_detail: {
      value: null,
      tier: null,
      base: 0,
      drivers: FORMULA.groups.map((group, index) => ({
        id: group.id,
        label: group.label,
        direction: group.direction,
        points: null,
        raw_value: null,
        raw_unit: null,
        context: null,
        chart_value: values[index] ?? null,
      })),
    },
  } as SuburbDetail;
}

const list: RankingResponse = {
  ranking: {
    slug: "canopy",
    title: "Tree canopy",
    question: "Where does canopy cover the suburb?",
    unit: "%",
    value_label: "Canopy cover",
  },
  dataset_connected: true,
  total: 1,
  offset: 0,
  limit: 1,
  filters: { state: "vic", region: null, council: null },
  regions: [],
  councils: [],
  rows: [
    {
      position: 1,
      place: {
        state: "vic",
        slug: "northcote",
        name: "Northcote",
        postcode: "3070",
        council_name: "Darebin",
        council_slug: "darebin",
        region_name: null,
        region_slug: null,
        traditional_owners: null,
        population: null,
        latitude: null,
        longitude: null,
        score: null,
        tier: null,
        blurb: null,
      },
      value: 18.4,
      value_label: "Canopy cover",
      context: "Published canopy layer",
      tier: null,
    },
  ],
  notice: "",
};

const icons = ["search", "menu", "close", "sun", "moon", "arrow"] as const;

function stage(node: ReactElement) {
  return (
    <MemoryRouter>
      <div style={{ background: "var(--paper)", color: "var(--ink)", padding: 24 }}>{node}</div>
    </MemoryRouter>
  );
}

const shots: [string, ReactElement][] = [
  ["SiteHeader", <SiteHeader />],
  ["SiteFooter", <SiteFooter />],
  [
    "PageIntro",
    <PageIntro
      kicker="Record"
      title="Tree canopy"
      lede="Share of land under canopy, from a published layer."
    />,
  ],
  ["SectionNav", <SectionNav score={null} />],
  ["CookieBanner", <CookieBanner />],
  [
    "FilterPills",
    <FilterPills
      label="Sample"
      value="canopy"
      onChange={() => undefined}
      options={[
        { id: "canopy", label: "Canopy" },
        { id: "rent", label: "Rent" },
        { id: "heat", label: "Heat" },
      ]}
    />,
  ],
  ["SearchField", <SearchField />],
  [
    "States",
    <div style={{ display: "grid", gap: 16 }}>
      <LoadingState label="Fetching the record." />
      <EmptyState title="Nothing on file" body="This section has no figure yet." />
      <ErrorState error={new Error("The service did not respond.")} onRetry={() => undefined} />
      <DatasetNotice
        connected={false}
        notice="No dataset is connected."
        emptyTitle="Nothing on file"
        emptyBody="This section has no figure yet."
      />
    </div>,
  ],
  [
    "TableScroll",
    <TableScroll label="Canopy rows">
      <table className="data">
        <caption>One published figure.</caption>
        <thead>
          <tr>
            <th scope="col">Suburb</th>
            <th scope="col">State</th>
            <th scope="col">Canopy cover</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Northcote</td>
            <td>VIC</td>
            <td className="num">18.4 %</td>
          </tr>
        </tbody>
      </table>
    </TableScroll>,
  ],
  ["SourceNote", <SourceNote source={canopyPayload.source} />],
  [
    "Icon",
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      {icons.map((name) => (
        <span key={name} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Icon name={name} />
          {name}
        </span>
      ))}
    </div>,
  ],
  [
    "MetricSection",
    <MetricSection
      config={canopyConfig}
      payload={canopyPayload}
      nearby={[]}
      origin={null}
      score={null}
    />,
  ],
  ["MetricsBlock", <MetricsBlock config={canopyConfig} payload={canopyPayload} />],
  [
    "CompareChart",
    <CompareChart
      tokens={["vic:northcote", "vic:brunswick"]}
      places={[
        place("Northcote", "northcote", [20, 30, 40, 50, 60, 70, 35, 45, 55, 65]),
        place("Brunswick", "brunswick", [25, 35, 45, 55, 28, 38, 48, 58, 33, 43]),
      ]}
    />,
  ],
  [
    "TrendChart",
    <TrendChart
      label="Canopy cover"
      unit="%"
      points={[
        { year: 2018, value: 16.2 },
        { year: 2020, value: 17.1 },
        { year: 2022, value: 18.4 },
      ]}
      referenceLabel="State median"
      referenceValue={15}
      narrative="Canopy cover from the published layer."
    />,
  ],
  [
    "ScoreBlock",
    <ScoreBlock
      score={{
        value: null,
        tier: null,
        base: 0,
        drivers: [
          {
            id: "parks",
            label: "Parks and canopy",
            direction: "positive",
            points: null,
            raw_value: 18.4,
            raw_unit: "%",
            context: "Canopy cover layer, 2024-06-01",
            chart_value: null,
          },
        ],
      }}
    />,
  ],
  ["RankTable", <RankTable ranking={list} />],
];

for (const [name, node] of shots) {
  test(name, async ({ mount, page }) => {
    await mount(stage(node));
    if (name === "CookieBanner") {
      await expect(page.locator("#cookie-banner")).toBeVisible();
      await expect(page.locator("#cookie-banner")).toHaveScreenshot(`${name}.png`);
      return;
    }
    await expect(page.locator("#root")).toHaveScreenshot(`${name}.png`);
  });
}

test("MapCanvas", async ({ mount, page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]")
      external.push(request.url());
  });
  await mount(
    stage(
      <MapCanvas
        centre={[144.9631, -37.8136]}
        zoom={12}
        label="Local blank map"
        collection={{
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [144.95, -37.82],
                    [144.98, -37.82],
                    [144.98, -37.8],
                    [144.95, -37.8],
                    [144.95, -37.82],
                  ],
                ],
              },
            },
          ],
        }}
        circle={null}
      />,
    ),
  );
  await expect(page.getByText("Loading the base map.")).toHaveCount(0);
  await expect(page.getByText("The base map did not load.")).toHaveCount(0);
  expect(external).toEqual([]);
  await expect(page.locator("#root")).toHaveScreenshot("MapCanvas.png");
});
