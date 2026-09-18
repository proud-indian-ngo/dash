import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import {
  Circle,
  Document,
  G,
  Image,
  Line,
  Page,
  Path,
  Rect,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

import { kalakritiIdCardAssets } from "./kalakriti-id-card-assets";
import {
  fitIdCardText,
  kalakritiIdCardSheet,
} from "./kalakriti-id-card-layout";

interface Person {
  id: string;
  name: string;
}

export interface KalakritiBlankIdCardData {
  id: string;
  type: "volunteer" | "guest" | "judge";
  blank: true;
}

export type KalakritiIdCardData = Person &
  (
    | {
        type: "student";
        centerName: string;
        competitions: { name: string; startsAt: number | null }[];
      }
    | { type: "volunteer"; role: string }
    | { type: "guardian"; centerName: string }
    | { type: "judge" | "guest" }
  );

const mm = (value: number) => (value * 72) / 25.4;
const dx = (value: number) => mm(value * kalakritiIdCardSheet.scaleX);
const dy = (value: number) => mm(value * kalakritiIdCardSheet.scaleY);
const {
  pageWidthMm: PAGE_WIDTH_MM,
  pageHeightMm: PAGE_HEIGHT_MM,
  cardWidthMm: CARD_WIDTH_MM,
  cardHeightMm: CARD_HEIGHT_MM,
} = kalakritiIdCardSheet;
const WIDTH = mm(CARD_WIDTH_MM);
const HEIGHT = mm(CARD_HEIGHT_MM);
const QR_MM =
  48 * Math.min(kalakritiIdCardSheet.scaleX, kalakritiIdCardSheet.scaleY);
const CUT_MARK_MM = 3;

export { kalakritiIdCardSheet };

const colors = {
  student: "#ef543b",
  volunteer: "#008e99",
  guardian: "#254caa",
  judge: "#e98400",
  guest: "#9d3d9c",
};
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function FestivalArtwork({ color }: { color: string }) {
  return (
    <Svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${kalakritiIdCardSheet.designWidthMm} ${kalakritiIdCardSheet.designHeightMm}`}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <Path d="M0 0H16Q12 11 0 23Z" fill={color} />
      <Circle cx="6" cy="3" r="0.9" fill="#ffcf52" />
      <Circle cx="4.8" cy="5.6" r="0.85" fill="#ffcf52" />
      <Circle cx="3.6" cy="8" r="0.8" fill="#ffcf52" />
      <Path d="M75 0H90V23Q85 10 75 0Z" fill="#ff9b31" />
      <Path d="M81 0H90V15Q84 9 81 0Z" fill="#f5614b" />
      <Path
        d="M83 3Q89 6 89 13Q84 10 83 3Z"
        fill="#ffce72"
        stroke="#ffffff"
        strokeWidth="0.5"
      />
      <Circle cx="81" cy="16" r="1.3" fill="#008f9e" />
      <Circle cx="83" cy="12" r="0.6" fill="#f5614b" />
      {[false, true].map((right) => (
        <G
          key={String(right)}
          transform={right ? "translate(90 0) scale(-1 1)" : "translate(0 0)"}
        >
          <Path d="M0 81Q14 87 4 101Q14 88 0 85Z" fill="#ffb32b" />
          <Path
            d="M0 87Q12 94 2 105L0 106Z"
            fill="#008daf"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M0 101Q10 104 10 114Q1 111 0 101Z"
            fill="#fc615b"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M10 114Q7 104 17 101Q18 110 10 114Z"
            fill="#294faa"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M0 112Q10 113 12 121Q3 120 0 112Z"
            fill="#fc615b"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M12 121Q9 113 21 112Q21 119 12 121Z"
            fill="#ffb32b"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M0 118Q19 116 28 130H0Z"
            fill={right ? "#ffb32b" : "#009c9f"}
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M0 121Q12 120 18 130H0Z"
            fill="#294faa"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Path
            d="M0 124Q8 124 12 130H0Z"
            fill="#fc615b"
            stroke="#ffffff"
            strokeWidth="0.65"
          />
          <Circle cx="3" cy="70" r="1.4" fill="#009a9e" />
          <Circle cx="3" cy="74.3" r="1.5" fill="#fc615b" />
          <Circle cx="3" cy="78.5" r="1.5" fill="#fc615b" />
          <Circle cx="15" cy="98" r="0.9" fill="#fc615b" />
          <Circle
            cx="17"
            cy="125"
            r="0.65"
            fill={right ? "#ffffff" : "#77ced0"}
          />
          <Circle
            cx="20"
            cy="127"
            r="0.85"
            fill={right ? "#ffffff" : "#77ced0"}
          />
          <Circle
            cx="23"
            cy="129"
            r="0.6"
            fill={right ? "#ffffff" : "#77ced0"}
          />
        </G>
      ))}
      <Circle
        cx="19"
        cy="7"
        r="2.2"
        fill="#ffffff"
        stroke="#697386"
        strokeWidth="0.2"
      />
      <Circle
        cx="71"
        cy="7"
        r="2.2"
        fill="#ffffff"
        stroke="#697386"
        strokeWidth="0.2"
      />
    </Svg>
  );
}

function PersonQr({ id, type }: Pick<KalakritiIdCardData, "id" | "type">) {
  const payload = parseKalakritiPersonQr(JSON.stringify({ id, type }));
  const { modules } = QRCode.create(JSON.stringify(payload), {
    errorCorrectionLevel: "M",
  });
  const quiet = 4;
  const size = modules.size + quiet * 2;
  let modulesPath = "";
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (modules.get(row, column)) {
        modulesPath += `M${column + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
  }
  return (
    <Svg width={mm(QR_MM)} height={mm(QR_MM)} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill="#ffffff" />
      <Path d={modulesPath} fill="#000000" />
    </Svg>
  );
}

export function KalakritiIdCard({
  person,
}: {
  person: KalakritiIdCardData | KalakritiBlankIdCardData;
}) {
  const text = "blank" in person ? null : fitIdCardText(person);
  const color = colors[person.type];
  return (
    <View
      wrap={false}
      style={{
        width: WIDTH,
        height: HEIGHT,
        position: "relative",
        border: "0.3pt solid #aab0ba",
        backgroundColor: "#ffffff",
        overflow: "hidden",
        fontFamily: "IdCard",
        color: "#101827",
      }}
    >
      <FestivalArtwork color={color} />
      <View
        style={{
          position: "absolute",
          top: dy(16),
          left: dx(7),
          right: dx(7),
          height: dy(14),
          flexDirection: "row",
          alignItems: "center",
          gap: dx(3.8),
          justifyContent: "center",
        }}
      >
        <Image
          src={kalakritiIdCardAssets.proudIndian}
          style={{ width: dx(42), height: dy(8.91), objectFit: "contain" }}
        />
        <View style={{ width: 0.5, height: dy(14) }} />
        <View style={{ width: dx(26), height: dy(7.51), overflow: "hidden" }}>
          <Image
            src={kalakritiIdCardAssets.kalakriti}
            style={{
              position: "absolute",
              width: dx(31.1),
              height: dy(21.99),
              left: dx(-2.62),
              top: dy(-7.51),
            }}
          />
        </View>
      </View>
      <Svg
        style={{ position: "absolute", left: dx(54), top: dy(16) }}
        width={1}
        height={dy(14)}
      >
        <Line
          x1={0.5}
          y1={0}
          x2={0.5}
          y2={dy(14)}
          stroke="#969aa3"
          strokeWidth={0.6}
        />
      </Svg>
      <Svg
        style={{ position: "absolute", left: 0, top: dy(33) }}
        width={WIDTH}
        height={dy(7)}
        viewBox="0 0 90 7"
      >
        <Line
          x1="9"
          y1="3.3"
          x2="19"
          y2="3.3"
          stroke={color}
          strokeWidth="0.35"
        />
        <Circle cx="21" cy="3.3" r="0.8" fill={color} />
        <Line
          x1="71"
          y1="3.3"
          x2="81"
          y2="3.3"
          stroke={color}
          strokeWidth="0.35"
        />
        <Circle cx="69" cy="3.3" r="0.8" fill={color} />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: dy(33),
          left: dx(23),
          right: dx(23),
          backgroundColor: color,
          borderRadius: dy(3),
          paddingVertical: dy(1.1),
        }}
      >
        <Text
          style={{
            color: "#ffffff",
            fontSize: 11,
            fontFamily: "IdCardBold",
            textAlign: "center",
            letterSpacing: 1,
          }}
        >
          {person.type.toUpperCase()}
        </Text>
      </View>
      {text ? (
        <View
          style={{
            position: "absolute",
            top: dy(42),
            left: dx(7),
            right: dx(7),
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: text.nameSize,
              fontFamily: "IdCardBold",
              textAlign: "center",
              lineHeight: 1.15,
            }}
          >
            {text.name.join("\n")}
          </Text>
          {text.details.length > 0 && (
            <Text
              style={{
                fontSize: text.bodySize,
                marginTop: 4,
                textAlign: "center",
                lineHeight: 1.15,
              }}
            >
              {text.details.join("\n")}
            </Text>
          )}
          {text.competitions.length > 0 && (
            <View style={{ width: "100%", marginTop: 5 }}>
              {text.competitions.map((competition, index) => (
                <View
                  key={`${competition.name}-${index}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text
                    style={{
                      width: 148 * kalakritiIdCardSheet.scaleX,
                      fontSize: text.competitionSize,
                      fontFamily: "IdCardBold",
                      lineHeight: 1.15,
                    }}
                  >
                    {competition.lines.join("\n")}
                  </Text>
                  <Text
                    style={{ fontSize: text.competitionSize, lineHeight: 1.15 }}
                  >
                    {competition.startsAt === null
                      ? "Time TBA"
                      : timeFormat.format(competition.startsAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View
          style={{
            position: "absolute",
            top: dy(59),
            left: dx(10),
            width: dx(70),
            borderBottom: "0.7pt solid #697386",
          }}
        />
      )}
      <View
        style={{
          position: "absolute",
          top: !text
            ? dy(70)
            : person.type === "student"
              ? dy(76)
              : dy(42) + text.height + dy(4),
          left: (WIDTH - mm(QR_MM)) / 2,
          width: mm(QR_MM),
          height: mm(QR_MM),
        }}
      >
        <PersonQr id={person.id} type={person.type} />
      </View>
    </View>
  );
}

export function KalakritiIdCards({
  people,
}: {
  people: (KalakritiIdCardData | KalakritiBlankIdCardData)[];
}) {
  if (people.length === 0)
    throw new Error("Select at least one person to print");
  const pages = Array.from(
    { length: Math.ceil(people.length / 4) },
    (_, index) => people.slice(index * 4, index * 4 + 4)
  );
  return (
    <Document title="Kalakriti ID cards" author="Proud Indian">
      {pages.map((page, pageIndex) => (
        <Page
          key={pageIndex}
          size="A4"
          wrap={false}
          style={{
            width: mm(PAGE_WIDTH_MM),
            height: mm(PAGE_HEIGHT_MM),
            minHeight: mm(PAGE_HEIGHT_MM),
            padding: 0,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 0,
          }}
        >
          {page.map((person, index) => (
            <View
              key={`${person.type}-${person.id}-${index}`}
              style={{ width: WIDTH, height: HEIGHT }}
            >
              <KalakritiIdCard person={person} />
            </View>
          ))}
          <Svg
            style={{ position: "absolute", top: 0, left: 0 }}
            width={mm(PAGE_WIDTH_MM)}
            height={mm(PAGE_HEIGHT_MM)}
            viewBox={`0 0 ${PAGE_WIDTH_MM} ${PAGE_HEIGHT_MM}`}
          >
            <Line
              x1={PAGE_WIDTH_MM / 2}
              y1={0}
              x2={PAGE_WIDTH_MM / 2}
              y2={CUT_MARK_MM}
              stroke="#526071"
              strokeWidth="0.15"
            />
            <Line
              x1={PAGE_WIDTH_MM / 2}
              y1={PAGE_HEIGHT_MM - CUT_MARK_MM}
              x2={PAGE_WIDTH_MM / 2}
              y2={PAGE_HEIGHT_MM}
              stroke="#526071"
              strokeWidth="0.15"
            />
            <Line
              x1={0}
              y1={PAGE_HEIGHT_MM / 2}
              x2={CUT_MARK_MM}
              y2={PAGE_HEIGHT_MM / 2}
              stroke="#526071"
              strokeWidth="0.15"
            />
            <Line
              x1={PAGE_WIDTH_MM - CUT_MARK_MM}
              y1={PAGE_HEIGHT_MM / 2}
              x2={PAGE_WIDTH_MM}
              y2={PAGE_HEIGHT_MM / 2}
              stroke="#526071"
              strokeWidth="0.15"
            />
          </Svg>
        </Page>
      ))}
    </Document>
  );
}
