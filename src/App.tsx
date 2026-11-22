import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  MousePointer2,
  Cable,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Upload,
  Search,
  Layers,
  Trash2,
  Plus,
  Printer,
  FileSpreadsheet,
  ListTree,
  Tag,
  LayoutGrid,
  Eye,
  EyeOff,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Zap,
  SlidersHorizontal,
  X,
  Sparkles,
  Send,
  Settings,
  Loader2,
} from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type PortType = 'L' | 'N' | 'PE' | 'signal';
type PortSide = 'top' | 'bottom';
type WireLayer = 'power' | 'control';
type WireSection = 1.5 | 2.5 | 4 | 6;
type EditorTab = 'editor' | 'bom' | 'cables' | 'labels';
type EditorMode = 'select' | 'wire';

type WireColorKey = 'L1' | 'L2' | 'L3' | 'N' | 'PE' | 'control';

interface ComponentPortDef {
  id: string;
  label: string;
  side: PortSide;
  type: PortType;
  /** Offset along module width in [0..1] fraction */
  offsetFraction: number;
}

interface ComponentDef {
  id: string;
  name: string;
  shortName: string;
  category: 'mcb' | 'rcd' | 'rcbo' | 'relay' | 'contactor' | 'terminal' | 'cross';
  widthModules: number;
  brand: string;
  article: string;
  price: number;
  laborCost: number;
  bodyColor: string;
  handleColor: string;
  accentColor: string;
  defaultPrefix: string;
  defaultRating: string;
  defaultLabel: string;
  ports: ComponentPortDef[];
}

interface PlacedItem {
  id: string;
  componentId: string;
  railId: number; // 0, 1, 2
  slotIndex: number; // 0..17
  designation: string;
  rating: string;
  label: string;
  article: string;
  price: number;
  laborCost: number;
}

interface WireEndpoint {
  itemId: string;
  portId: string;
}

interface Wire {
  id: string;
  from: WireEndpoint;
  to: WireEndpoint;
  color: WireColorKey;
  section: WireSection;
  layer: WireLayer;
}

interface LayerVisibility {
  rails: boolean;
  modules: boolean;
  powerWires: boolean;
  controlWires: boolean;
  labels: boolean;
}

interface PanelDocument {
  items: PlacedItem[];
  wires: Wire[];
  terminationCostPerEnd: number;
}

interface Point {
  x: number;
  y: number;
}

interface RoutedWire {
  wire: Wire;
  points: Point[];
  pathD: string;
  rawLengthMm: number;
  totalLengthMm: number;
}

// Geometry constants (1 SVG unit = 1 mm)
const MODULE_MM = 18;
const SLOTS_PER_RAIL = 18;
const RAIL_COUNT = 3;
const RAIL_WIDTH_MM = SLOTS_PER_RAIL * MODULE_MM; // 324 mm
const RAIL_START_X = 62;
const RAIL_END_X = RAIL_START_X + RAIL_WIDTH_MM; // 386 mm
const PANEL_WIDTH_MM = 448;
const PANEL_HEIGHT_MM = 504;
const RAIL_CENTERS_Y = [102, 252, 402]; // 150 mm standard DIN pitch
const MODULE_HEIGHT_MM = 84;
const PORT_Y_OFFSET = 36; // distance from rail center to terminal screw

const STORAGE_KEY = 'panel_cad_2d_state_v1';

const WIRE_COLORS: Record<
  WireColorKey,
  { name: string; short: string; hex: string; stripeHex?: string; defaultLayer: WireLayer }
> = {
  L1: { name: 'L1 Коричневый', short: 'L1 (Кор.)', hex: '#92400e', defaultLayer: 'power' },
  L2: { name: 'L2 Черный', short: 'L2 (Чер.)', hex: '#1e293b', defaultLayer: 'power' },
  L3: { name: 'L3 Серый', short: 'L3 (Сер.)', hex: '#94a3b8', defaultLayer: 'power' },
  N: { name: 'N Синий', short: 'N (Син.)', hex: '#2563eb', defaultLayer: 'power' },
  PE: {
    name: 'PE Желто-зеленый',
    short: 'PE (Ж-З)',
    hex: '#eab308',
    stripeHex: '#16a34a',
    defaultLayer: 'power',
  },
  control: {
    name: 'Управление Оранжевый',
    short: 'Упр. (Оранж.)',
    hex: '#f97316',
    defaultLayer: 'control',
  },
};

const WIRE_SECTIONS: WireSection[] = [1.5, 2.5, 4, 6];

// ============================================================================
// COMPONENT LIBRARY (10 MODULAR ELECTRICAL DEVICES)
// ============================================================================

const COMPONENT_LIBRARY: ComponentDef[] = [
  {
    id: 'mcb-3p',
    name: 'Вводной автомат 3P',
    shortName: 'Автомат 3P',
    category: 'mcb',
    widthModules: 3,
    brand: 'ABB',
    article: '2CDS253001R0324',
    price: 2450,
    laborCost: 450,
    bodyColor: '#f1f5f9',
    handleColor: '#0f172a',
    accentColor: '#ef4444',
    defaultPrefix: 'QF',
    defaultRating: 'C32',
    defaultLabel: 'Вводной автомат',
    ports: [
      { id: '1', label: '1', side: 'top', type: 'L', offsetFraction: 1 / 6 },
      { id: '3', label: '3', side: 'top', type: 'L', offsetFraction: 3 / 6 },
      { id: '5', label: '5', side: 'top', type: 'L', offsetFraction: 5 / 6 },
      { id: '2', label: '2', side: 'bottom', type: 'L', offsetFraction: 1 / 6 },
      { id: '4', label: '4', side: 'bottom', type: 'L', offsetFraction: 3 / 6 },
      { id: '6', label: '6', side: 'bottom', type: 'L', offsetFraction: 5 / 6 },
    ],
  },
  {
    id: 'mcb-1p',
    name: 'Автомат 1P',
    shortName: 'Автомат 1P',
    category: 'mcb',
    widthModules: 1,
    brand: 'ABB',
    article: '2CDS251001R0164',
    price: 590,
    laborCost: 250,
    bodyColor: '#f1f5f9',
    handleColor: '#1e293b',
    accentColor: '#3b82f6',
    defaultPrefix: 'QF',
    defaultRating: 'C16',
    defaultLabel: 'Групповая линия',
    ports: [
      { id: '1', label: '1', side: 'top', type: 'L', offsetFraction: 0.5 },
      { id: '2', label: '2', side: 'bottom', type: 'L', offsetFraction: 0.5 },
    ],
  },
  {
    id: 'mcb-2p',
    name: 'Автомат 2P',
    shortName: 'Автомат 2P',
    category: 'mcb',
    widthModules: 2,
    brand: 'ABB',
    article: '2CDS252001R0254',
    price: 1320,
    laborCost: 350,
    bodyColor: '#f1f5f9',
    handleColor: '#1e293b',
    accentColor: '#3b82f6',
    defaultPrefix: 'QF',
    defaultRating: 'C25',
    defaultLabel: 'Варочная панель',
    ports: [
      { id: '1', label: '1', side: 'top', type: 'L', offsetFraction: 0.25 },
      { id: '3', label: '3', side: 'top', type: 'N', offsetFraction: 0.75 },
      { id: '2', label: '2', side: 'bottom', type: 'L', offsetFraction: 0.25 },
      { id: '4', label: '4', side: 'bottom', type: 'N', offsetFraction: 0.75 },
    ],
  },
  {
    id: 'rcd-2p',
    name: 'УЗО 2P',
    shortName: 'УЗО 2P',
    category: 'rcd',
    widthModules: 2,
    brand: 'ABB',
    article: '2CSF202006R1400',
    price: 3850,
    laborCost: 400,
    bodyColor: '#f8fafc',
    handleColor: '#2563eb',
    accentColor: '#2563eb',
    defaultPrefix: 'FD',
    defaultRating: '40A 30mA',
    defaultLabel: 'УЗО групповое',
    ports: [
      { id: '1', label: '1', side: 'top', type: 'L', offsetFraction: 0.25 },
      { id: 'N1', label: 'N', side: 'top', type: 'N', offsetFraction: 0.75 },
      { id: '2', label: '2', side: 'bottom', type: 'L', offsetFraction: 0.25 },
      { id: 'N2', label: 'N', side: 'bottom', type: 'N', offsetFraction: 0.75 },
    ],
  },
  {
    id: 'rcbo-2p',
    name: 'Дифавтомат 2P',
    shortName: 'Дифавтомат 2P',
    category: 'rcbo',
    widthModules: 2,
    brand: 'ABB',
    article: '2CSR255140R1164',
    price: 4690,
    laborCost: 450,
    bodyColor: '#f8fafc',
    handleColor: '#0284c7',
    accentColor: '#0ea5e9',
    defaultPrefix: 'QFD',
    defaultRating: 'C16 30mA',
    defaultLabel: 'Влажная зона',
    ports: [
      { id: '1', label: '1', side: 'top', type: 'L', offsetFraction: 0.25 },
      { id: 'N1', label: 'N', side: 'top', type: 'N', offsetFraction: 0.75 },
      { id: '2', label: '2', side: 'bottom', type: 'L', offsetFraction: 0.25 },
      { id: 'N2', label: 'N', side: 'bottom', type: 'N', offsetFraction: 0.75 },
    ],
  },
  {
    id: 'voltage-relay-2p',
    name: 'Реле напряжения 2P',
    shortName: 'Реле напр. 2P',
    category: 'relay',
    widthModules: 2,
    brand: 'Новатек',
    article: 'RN-263T',
    price: 3490,
    laborCost: 400,
    bodyColor: '#e2e8f0',
    handleColor: '#dc2626',
    accentColor: '#f59e0b',
    defaultPrefix: 'KV',
    defaultRating: '63A',
    defaultLabel: 'Контроль напряжения',
    ports: [
      { id: 'Lin', label: 'Lвх', side: 'top', type: 'L', offsetFraction: 0.25 },
      { id: 'Nin', label: 'N', side: 'top', type: 'N', offsetFraction: 0.75 },
      { id: 'Lout', label: 'Lвых', side: 'bottom', type: 'L', offsetFraction: 0.25 },
      { id: 'Nout', label: 'N', side: 'bottom', type: 'N', offsetFraction: 0.75 },
    ],
  },
  {
    id: 'contactor-2p',
    name: 'Контактор 2P',
    shortName: 'Контактор 2P',
    category: 'contactor',
    widthModules: 2,
    brand: 'ABB',
    article: '1SAE231111R0620',
    price: 3250,
    laborCost: 450,
    bodyColor: '#e2e8f0',
    handleColor: '#475569',
    accentColor: '#f97316',
    defaultPrefix: 'KM',
    defaultRating: '25A 2NO',
    defaultLabel: 'Мастер-выключатель',
    ports: [
      { id: '1', label: '1', side: 'top', type: 'L', offsetFraction: 0.2 },
      { id: '3', label: '3', side: 'top', type: 'L', offsetFraction: 0.5 },
      { id: 'A1', label: 'A1', side: 'top', type: 'signal', offsetFraction: 0.82 },
      { id: '2', label: '2', side: 'bottom', type: 'L', offsetFraction: 0.2 },
      { id: '4', label: '4', side: 'bottom', type: 'L', offsetFraction: 0.5 },
      { id: 'A2', label: 'A2', side: 'bottom', type: 'signal', offsetFraction: 0.82 },
    ],
  },
  {
    id: 'terminal-n',
    name: 'Клемма N',
    shortName: 'Клемма N',
    category: 'terminal',
    widthModules: 1,
    brand: 'IEK',
    article: 'YZN10-016-K07',
    price: 165,
    laborCost: 150,
    bodyColor: '#2563eb',
    handleColor: '#1d4ed8',
    accentColor: '#3b82f6',
    defaultPrefix: 'XN',
    defaultRating: '16мм²',
    defaultLabel: 'Шина N',
    ports: [
      { id: '1', label: 'N1', side: 'top', type: 'N', offsetFraction: 0.5 },
      { id: '2', label: 'N2', side: 'bottom', type: 'N', offsetFraction: 0.5 },
    ],
  },
  {
    id: 'terminal-pe',
    name: 'Клемма PE',
    shortName: 'Клемма PE',
    category: 'terminal',
    widthModules: 1,
    brand: 'IEK',
    article: 'YZN10-016-K06',
    price: 195,
    laborCost: 150,
    bodyColor: '#eab308',
    handleColor: '#16a34a',
    accentColor: '#22c55e',
    defaultPrefix: 'XPE',
    defaultRating: '16мм²',
    defaultLabel: 'Шина PE',
    ports: [
      { id: '1', label: 'PE1', side: 'top', type: 'PE', offsetFraction: 0.5 },
      { id: '2', label: 'PE2', side: 'bottom', type: 'PE', offsetFraction: 0.5 },
    ],
  },
  {
    id: 'cross-module-4p',
    name: 'Кросс-модуль 4P',
    shortName: 'Кросс-мод. 4P',
    category: 'cross',
    widthModules: 4,
    brand: 'IEK',
    article: 'YNN10-4-07-100',
    price: 1450,
    laborCost: 500,
    bodyColor: '#cbd5e1',
    handleColor: '#334155',
    accentColor: '#8b5cf6',
    defaultPrefix: 'XT',
    defaultRating: '100A 4x7',
    defaultLabel: 'Распределение фаз',
    ports: [
      { id: 'L1', label: 'L1', side: 'top', type: 'L', offsetFraction: 0.14 },
      { id: 'L2', label: 'L2', side: 'top', type: 'L', offsetFraction: 0.38 },
      { id: 'L3', label: 'L3', side: 'top', type: 'L', offsetFraction: 0.62 },
      { id: 'N1', label: 'N', side: 'top', type: 'N', offsetFraction: 0.86 },
      { id: 'L1b', label: 'L1', side: 'bottom', type: 'L', offsetFraction: 0.14 },
      { id: 'L2b', label: 'L2', side: 'bottom', type: 'L', offsetFraction: 0.38 },
      { id: 'L3b', label: 'L3', side: 'bottom', type: 'L', offsetFraction: 0.62 },
      { id: 'N2', label: 'N', side: 'bottom', type: 'N', offsetFraction: 0.86 },
    ],
  },
];

const COMPONENT_MAP: Record<string, ComponentDef> = Object.fromEntries(
  COMPONENT_LIBRARY.map((c) => [c.id, c])
);

// ============================================================================
// PRELOADED DEMO SWITCHBOARD
// ============================================================================

function createDemoDocument(): PanelDocument {
  const items: PlacedItem[] = [
    {
      id: 'item-qf1',
      componentId: 'mcb-3p',
      railId: 0,
      slotIndex: 0,
      designation: 'QF1',
      rating: 'C32',
      label: 'Вводной автомат',
      article: '2CDS253001R0324',
      price: 2450,
      laborCost: 450,
    },
    {
      id: 'item-kv1',
      componentId: 'voltage-relay-2p',
      railId: 0,
      slotIndex: 4,
      designation: 'KV1',
      rating: '63A',
      label: 'Реле напряжения',
      article: 'RN-263T',
      price: 3490,
      laborCost: 400,
    },
    {
      id: 'item-fd1',
      componentId: 'rcd-2p',
      railId: 0,
      slotIndex: 7,
      designation: 'FD1',
      rating: '40A 30mA',
      label: 'УЗО розеток',
      article: '2CSF202006R1400',
      price: 3850,
      laborCost: 400,
    },
    {
      id: 'item-xn1',
      componentId: 'terminal-n',
      railId: 0,
      slotIndex: 15,
      designation: 'XN1',
      rating: '16мм²',
      label: 'Вводной ноль N',
      article: 'YZN10-016-K07',
      price: 165,
      laborCost: 150,
    },
    {
      id: 'item-xpe1',
      componentId: 'terminal-pe',
      railId: 0,
      slotIndex: 16,
      designation: 'XPE1',
      rating: '16мм²',
      label: 'Заземление PE',
      article: 'YZN10-016-K06',
      price: 195,
      laborCost: 150,
    },
    {
      id: 'item-qf2',
      componentId: 'mcb-1p',
      railId: 1,
      slotIndex: 1,
      designation: 'QF2',
      rating: 'C16',
      label: 'Розетки кухня',
      article: '2CDS251001R0164',
      price: 590,
      laborCost: 250,
    },
    {
      id: 'item-qf3',
      componentId: 'mcb-1p',
      railId: 1,
      slotIndex: 2,
      designation: 'QF3',
      rating: 'C16',
      label: 'Розетки гостиная',
      article: '2CDS251001R0164',
      price: 590,
      laborCost: 250,
    },
    {
      id: 'item-qf4',
      componentId: 'mcb-1p',
      railId: 1,
      slotIndex: 3,
      designation: 'QF4',
      rating: 'C10',
      label: 'Освещение',
      article: '2CDS251001R0164',
      price: 590,
      laborCost: 250,
    },
    {
      id: 'item-qfd1',
      componentId: 'rcbo-2p',
      railId: 1,
      slotIndex: 6,
      designation: 'QFD1',
      rating: 'C16 30mA',
      label: 'Стиральная машина',
      article: '2CSR255140R1164',
      price: 4690,
      laborCost: 450,
    },
    {
      id: 'item-km1',
      componentId: 'contactor-2p',
      railId: 1,
      slotIndex: 10,
      designation: 'KM1',
      rating: '25A 2NO',
      label: 'Мастер-свет',
      article: '1SAE231111R0620',
      price: 3250,
      laborCost: 450,
    },
  ];

  const wires: Wire[] = [
    {
      id: 'w-1',
      from: { itemId: 'item-qf1', portId: '2' },
      to: { itemId: 'item-kv1', portId: 'Lin' },
      color: 'L1',
      section: 6,
      layer: 'power',
    },
    {
      id: 'w-2',
      from: { itemId: 'item-xn1', portId: '1' },
      to: { itemId: 'item-kv1', portId: 'Nin' },
      color: 'N',
      section: 6,
      layer: 'power',
    },
    {
      id: 'w-3',
      from: { itemId: 'item-kv1', portId: 'Lout' },
      to: { itemId: 'item-fd1', portId: '1' },
      color: 'L1',
      section: 6,
      layer: 'power',
    },
    {
      id: 'w-4',
      from: { itemId: 'item-kv1', portId: 'Nout' },
      to: { itemId: 'item-fd1', portId: 'N1' },
      color: 'N',
      section: 6,
      layer: 'power',
    },
    {
      id: 'w-5',
      from: { itemId: 'item-fd1', portId: '2' },
      to: { itemId: 'item-qf2', portId: '1' },
      color: 'L1',
      section: 4,
      layer: 'power',
    },
    {
      id: 'w-6',
      from: { itemId: 'item-qf2', portId: '1' },
      to: { itemId: 'item-qf3', portId: '1' },
      color: 'L1',
      section: 4,
      layer: 'power',
    },
    {
      id: 'w-7',
      from: { itemId: 'item-qf3', portId: '1' },
      to: { itemId: 'item-qf4', portId: '1' },
      color: 'L1',
      section: 4,
      layer: 'power',
    },
    {
      id: 'w-8',
      from: { itemId: 'item-kv1', portId: 'Lout' },
      to: { itemId: 'item-qfd1', portId: '1' },
      color: 'L1',
      section: 4,
      layer: 'power',
    },
    {
      id: 'w-9',
      from: { itemId: 'item-kv1', portId: 'Nout' },
      to: { itemId: 'item-qfd1', portId: 'N1' },
      color: 'N',
      section: 4,
      layer: 'power',
    },
    {
      id: 'w-10',
      from: { itemId: 'item-qf4', portId: '2' },
      to: { itemId: 'item-km1', portId: 'A1' },
      color: 'control',
      section: 1.5,
      layer: 'control',
    },
    {
      id: 'w-11',
      from: { itemId: 'item-xn1', portId: '2' },
      to: { itemId: 'item-km1', portId: 'A2' },
      color: 'N',
      section: 1.5,
      layer: 'control',
    },
  ];

  return {
    items,
    wires,
    terminationCostPerEnd: 120,
  };
}

// ============================================================================
// GEOMETRY & ORTHOGONAL AUTO-ROUTING ENGINE
// ============================================================================

function getItemBounds(item: PlacedItem): { x: number; y: number; width: number; height: number } {
  const def = COMPONENT_MAP[item.componentId];
  const width = (def ? def.widthModules : 1) * MODULE_MM;
  const x = RAIL_START_X + item.slotIndex * MODULE_MM;
  const railY = RAIL_CENTERS_Y[item.railId] ?? RAIL_CENTERS_Y[0];
  const y = railY - MODULE_HEIGHT_MM / 2;
  return { x, y, width, height: MODULE_HEIGHT_MM };
}

function getPortWorldPos(
  item: PlacedItem,
  portId: string
): { x: number; y: number; side: PortSide; railId: number; portDef: ComponentPortDef } | null {
  const def = COMPONENT_MAP[item.componentId];
  if (!def) return null;
  const portDef = def.ports.find((p) => p.id === portId);
  if (!portDef) return null;
  const bounds = getItemBounds(item);
  const railY = RAIL_CENTERS_Y[item.railId] ?? RAIL_CENTERS_Y[0];
  const x = bounds.x + bounds.width * portDef.offsetFraction;
  const y = portDef.side === 'top' ? railY - PORT_Y_OFFSET : railY + PORT_Y_OFFSET;
  return { x, y, side: portDef.side, railId: item.railId, portDef };
}

/**
 * Returns the horizontal corridor index (0..3) directly facing a given rail and port side.
 * Corridor 0: above Rail 0
 * Corridor 1: between Rail 0 and Rail 1
 * Corridor 2: between Rail 1 and Rail 2
 * Corridor 3: below Rail 2
 */
function getCorridorIndex(railId: number, side: PortSide): number {
  return side === 'top' ? railId : railId + 1;
}

const CORRIDOR_BASE_Y = [34, 177, 327, 468];
const CORRIDOR_HALF_SPAN = 19;

function getCorridorLaneY(corridorIdx: number, laneIdx: number, totalInCorridor: number): number {
  const base = CORRIDOR_BASE_Y[corridorIdx] ?? 177;
  if (totalInCorridor <= 1) return base;
  const step = Math.min(4.8, (CORRIDOR_HALF_SPAN * 2) / Math.max(1, totalInCorridor - 1));
  const start = base - ((totalInCorridor - 1) * step) / 2;
  return start + laneIdx * step;
}

function getDuctLaneX(side: 'left' | 'right', laneIdx: number, totalInDuct: number): number {
  const base = side === 'left' ? 32 : PANEL_WIDTH_MM - 32;
  if (totalInDuct <= 1) return base;
  const step = Math.min(4.5, 34 / Math.max(1, totalInDuct - 1));
  const start = base - ((totalInDuct - 1) * step) / 2;
  return start + laneIdx * step;
}

function simplifyOrthogonalPoints(pts: Point[]): Point[] {
  const clean: Point[] = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 0.01 && Math.abs(prev.y - p.y) < 0.01) {
      continue;
    }
    clean.push(p);
  }
  const reduced: Point[] = [];
  for (let i = 0; i < clean.length; i++) {
    if (i > 0 && i < clean.length - 1) {
      const a = reduced[reduced.length - 1];
      const b = clean[i];
      const c = clean[i + 1];
      const sameX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
      const sameY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
      if (sameX || sameY) continue;
    }
    reduced.push(clean[i]);
  }
  return reduced;
}

function pointsToSvgPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  const r = 3.2; // crisp slight corner radius while preserving 90° geometry
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];

    const dx1 = pCurr.x - pPrev.x;
    const dy1 = pCurr.y - pPrev.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = pNext.x - pCurr.x;
    const dy2 = pNext.y - pCurr.y;
    const len2 = Math.hypot(dx2, dy2);

    const cornerR = Math.min(r, len1 / 2.2, len2 / 2.2);
    if (cornerR < 0.5) {
      d += ` L ${pCurr.x.toFixed(1)} ${pCurr.y.toFixed(1)}`;
    } else {
      const startX = pCurr.x - (dx1 / len1) * cornerR;
      const startY = pCurr.y - (dy1 / len1) * cornerR;
      const endX = pCurr.x + (dx2 / len2) * cornerR;
      const endY = pCurr.y + (dy2 / len2) * cornerR;
      d += ` L ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${pCurr.x.toFixed(1)} ${pCurr.y.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    }
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

function computeWireLengthMm(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
  }
  return len;
}

function computeRoutedWires(items: PlacedItem[], wires: Wire[]): RoutedWire[] {
  const itemMap = new Map(items.map((it) => [it.id, it]));

  // Pre-classify corridor & duct usage to spread wires cleanly into parallel lanes
  interface WireMeta {
    wire: Wire;
    p1: NonNullable<ReturnType<typeof getPortWorldPos>>;
    p2: NonNullable<ReturnType<typeof getPortWorldPos>>;
    c1: number;
    c2: number;
    ductSide: 'left' | 'right' | null;
  }

  const metas: WireMeta[] = [];
  const corridorMembers: number[][] = [[], [], [], []];
  const ductMembers: { left: number[]; right: number[] } = { left: [], right: [] };

  wires.forEach((wire) => {
    const it1 = itemMap.get(wire.from.itemId);
    const it2 = itemMap.get(wire.to.itemId);
    if (!it1 || !it2) return;
    const p1 = getPortWorldPos(it1, wire.from.portId);
    const p2 = getPortWorldPos(it2, wire.to.portId);
    if (!p1 || !p2) return;

    const c1 = getCorridorIndex(p1.railId, p1.side);
    const c2 = getCorridorIndex(p2.railId, p2.side);
    const idx = metas.length;

    let ductSide: 'left' | 'right' | null = null;
    if (c1 !== c2) {
      const avgX = (p1.x + p2.x) / 2;
      ductSide = avgX < PANEL_WIDTH_MM / 2 ? 'left' : 'right';
      ductMembers[ductSide].push(idx);
      corridorMembers[c1].push(idx);
      corridorMembers[c2].push(idx);
    } else {
      corridorMembers[c1].push(idx);
    }

    metas.push({ wire, p1, p2, c1, c2, ductSide });
  });

  return metas.map((m, idx) => {
    const { wire, p1, p2, c1, c2, ductSide } = m;
    let rawPts: Point[];

    if (c1 === c2) {
      const laneIdx = corridorMembers[c1].indexOf(idx);
      const yCorridor = getCorridorLaneY(c1, laneIdx, corridorMembers[c1].length);
      rawPts = [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: yCorridor },
        { x: p2.x, y: yCorridor },
        { x: p2.x, y: p2.y },
      ];
    } else {
      const lane1 = corridorMembers[c1].indexOf(idx);
      const lane2 = corridorMembers[c2].indexOf(idx);
      const y1 = getCorridorLaneY(c1, lane1, corridorMembers[c1].length);
      const y2 = getCorridorLaneY(c2, lane2, corridorMembers[c2].length);
      const side = ductSide ?? 'left';
      const ductLane = ductMembers[side].indexOf(idx);
      const xDuct = getDuctLaneX(side, ductLane, ductMembers[side].length);

      rawPts = [
        { x: p1.x, y: p1.y },
        { x: p1.x, y: y1 },
        { x: xDuct, y: y1 },
        { x: xDuct, y: y2 },
        { x: p2.x, y: y2 },
        { x: p2.x, y: p2.y },
      ];
    }

    const points = simplifyOrthogonalPoints(rawPts);
    const rawLengthMm = Math.round(computeWireLengthMm(points));
    const totalLengthMm = rawLengthMm + 100;

    return {
      wire,
      points,
      pathD: pointsToSvgPath(points),
      rawLengthMm,
      totalLengthMm,
    };
  });
}

// ============================================================================
// SLOT COLLISION & PLACEMENT HELPERS
// ============================================================================

function canPlaceAt(
  items: PlacedItem[],
  railId: number,
  slotIndex: number,
  widthModules: number,
  ignoreItemId?: string
): boolean {
  if (railId < 0 || railId >= RAIL_COUNT) return false;
  if (slotIndex < 0 || slotIndex + widthModules > SLOTS_PER_RAIL) return false;
  const endSlot = slotIndex + widthModules;
  for (const item of items) {
    if (item.id === ignoreItemId) continue;
    if (item.railId !== railId) continue;
    const def = COMPONENT_MAP[item.componentId];
    const w = def ? def.widthModules : 1;
    const itemEnd = item.slotIndex + w;
    if (slotIndex < itemEnd && endSlot > item.slotIndex) {
      return false;
    }
  }
  return true;
}

function findFirstFreeSlot(
  items: PlacedItem[],
  widthModules: number
): { railId: number; slotIndex: number } | null {
  for (let railId = 0; railId < RAIL_COUNT; railId++) {
    for (let slot = 0; slot <= SLOTS_PER_RAIL - widthModules; slot++) {
      if (canPlaceAt(items, railId, slot, widthModules)) {
        return { railId, slotIndex: slot };
      }
    }
  }
  return null;
}

function getNextDesignation(items: PlacedItem[], prefix: string): string {
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  for (const it of items) {
    const m = it.designation.match(regex);
    if (m) {
      maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  return `${prefix}${maxNum + 1}`;
}

function inferWireColorFromPort(portType: PortType): { color: WireColorKey; layer: WireLayer } {
  if (portType === 'N') return { color: 'N', layer: 'power' };
  if (portType === 'PE') return { color: 'PE', layer: 'power' };
  if (portType === 'signal') return { color: 'control', layer: 'control' };
  return { color: 'L1', layer: 'power' };
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatRub(val: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(val)) + ' ₽';
}

// ============================================================================
// VECTOR MODULE RENDERER (REALISTIC DIN-RAIL HARDWARE SVG)
// ============================================================================

interface ModuleSvgProps {
  item: PlacedItem;
  isSelected: boolean;
  isDragging: boolean;
  mode: EditorMode;
  showLabels: boolean;
  wireStart: WireEndpoint | null;
  hoveredPort: WireEndpoint | null;
  onPointerDownModule: (e: React.PointerEvent, item: PlacedItem) => void;
  onPortClick: (e: React.MouseEvent, itemId: string, portId: string) => void;
  onPortHover: (ep: WireEndpoint | null) => void;
}

const ModuleSvg: React.FC<ModuleSvgProps> = React.memo(
  ({
    item,
    isSelected,
    isDragging,
    mode,
    showLabels,
    wireStart,
    hoveredPort,
    onPointerDownModule,
    onPortClick,
    onPortHover,
  }) => {
    const def = COMPONENT_MAP[item.componentId];
    if (!def) return null;
    const { x, y, width, height } = getItemBounds(item);
    const railY = RAIL_CENTERS_Y[item.railId];

    const isTerminal = def.category === 'terminal';
    const isCross = def.category === 'cross';
    const isRelay = def.category === 'relay';
    const isContactor = def.category === 'contactor';
    const isRcd = def.category === 'rcd' || def.category === 'rcbo';
    const isMcb = def.category === 'mcb';

    return (
      <g
        transform={`translate(${x}, ${y})`}
        className={mode === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}
        opacity={isDragging ? 0.85 : 1}
        onPointerDown={(e) => onPointerDownModule(e, item)}
      >
        {/* Subtle drop shadow */}
        <rect
          x={0.8}
          y={1.2}
          width={width - 1.2}
          height={height - 1.2}
          rx={1.8}
          fill="#020617"
          opacity={0.45}
        />

        {/* Main housing */}
        <rect
          x={0.4}
          y={0.4}
          width={width - 0.8}
          height={height - 0.8}
          rx={1.8}
          fill={def.bodyColor}
          stroke={isSelected ? '#38bdf8' : '#64748b'}
          strokeWidth={isSelected ? 1.4 : 0.6}
        />

        {/* PE diagonal stripe accent for PE terminal */}
        {item.componentId === 'terminal-pe' && (
          <g>
            <rect x={1} y={14} width={width - 2} height={height - 28} fill="#16a34a" opacity={0.9} />
            <rect x={1} y={24} width={width - 2} height={10} fill="#facc15" />
            <rect x={1} y={48} width={width - 2} height={10} fill="#facc15" />
          </g>
        )}

        {/* Top & Bottom terminal recessed bays */}
        {!isTerminal && (
          <>
            <rect
              x={1.2}
              y={1.2}
              width={width - 2.4}
              height={14}
              rx={1}
              fill="#cbd5e1"
              opacity={0.65}
            />
            <rect
              x={1.2}
              y={height - 15.2}
              width={width - 2.4}
              height={14}
              rx={1}
              fill="#cbd5e1"
              opacity={0.65}
            />
          </>
        )}

        {/* Front raised face (plastron cutout area: 45 mm standard height) */}
        {!isTerminal && (
          <rect
            x={1.4}
            y={19.5}
            width={width - 2.8}
            height={45}
            rx={1}
            fill={isCross ? '#e2e8f0' : '#ffffff'}
            stroke="#94a3b8"
            strokeWidth={0.45}
          />
        )}

        {/* Pole divider seams for multi-module MCBs */}
        {isMcb &&
          def.widthModules > 1 &&
          Array.from({ length: def.widthModules - 1 }).map((_, idx) => (
            <line
              key={idx}
              x1={(idx + 1) * MODULE_MM}
              y1={2}
              x2={(idx + 1) * MODULE_MM}
              y2={height - 2}
              stroke="#cbd5e1"
              strokeWidth={0.5}
            />
          ))}

        {/* === DEVICE-SPECIFIC FRONT GRAPHICS === */}

        {/* MCB 1P / 2P / 3P */}
        {isMcb && (
          <g>
            {/* Brand + rating */}
            <text
              x={3}
              y={25.5}
              fontSize={3.6}
              fontWeight={700}
              fill="#dc2626"
              fontFamily="Inter, sans-serif"
            >
              {def.brand}
            </text>
            <text
              x={3}
              y={30.5}
              fontSize={3.4}
              fontWeight={600}
              fill="#334155"
              fontFamily="monospace"
            >
              {item.rating}
            </text>
            {/* Status window (ON red) */}
            <rect x={width / 2 - 4} y={34} width={8} height={3.5} rx={0.6} fill="#dc2626" />
            <text
              x={width / 2}
              y={36.8}
              fontSize={2.6}
              fontWeight={700}
              fill="#ffffff"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              I-ON
            </text>
            {/* Toggle switch bar */}
            <rect
              x={3.2}
              y={41}
              width={width - 6.4}
              height={11}
              rx={1.5}
              fill={def.handleColor}
              stroke="#020617"
              strokeWidth={0.4}
            />
            <rect
              x={4.5}
              y={42.2}
              width={width - 9}
              height={3.2}
              rx={0.8}
              fill="#475569"
              opacity={0.7}
            />
            {/* Bottom designation tag */}
            <text
              x={width / 2}
              y={60}
              fontSize={4}
              fontWeight={700}
              fill="#0f172a"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {item.designation}
            </text>
          </g>
        )}

        {/* RCD / RCBO */}
        {isRcd && (
          <g>
            <text
              x={3.2}
              y={25.5}
              fontSize={3.6}
              fontWeight={700}
              fill="#dc2626"
              fontFamily="Inter, sans-serif"
            >
              {def.brand}
            </text>
            <text
              x={3.2}
              y={30.2}
              fontSize={3.1}
              fontWeight={600}
              fill="#0f172a"
              fontFamily="monospace"
            >
              {item.rating}
            </text>
            {/* TEST button */}
            <rect
              x={4}
              y={34}
              width={10}
              height={6.5}
              rx={1.2}
              fill="#eab308"
              stroke="#a16207"
              strokeWidth={0.5}
            />
            <text
              x={9}
              y={38.5}
              fontSize={3.4}
              fontWeight={800}
              fill="#0f172a"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              T
            </text>
            {/* Status window */}
            <rect x={21} y={35} width={9} height={4} rx={0.6} fill="#dc2626" />
            {/* Blue toggle switch */}
            <rect
              x={17.5}
              y={42}
              width={14.5}
              height={11}
              rx={1.5}
              fill={def.handleColor}
              stroke="#1e3a8a"
              strokeWidth={0.5}
            />
            {/* Mini schematic symbol on left */}
            <circle cx={9} cy={47.5} r={3.2} fill="none" stroke="#64748b" strokeWidth={0.6} />
            <line x1={9} y1={43} x2={9} y2={52} stroke="#64748b" strokeWidth={0.5} />
            <text
              x={width / 2}
              y={60.5}
              fontSize={4}
              fontWeight={700}
              fill="#0f172a"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {item.designation}
            </text>
          </g>
        )}

        {/* Voltage Relay */}
        {isRelay && (
          <g>
            <text
              x={width / 2}
              y={24.5}
              fontSize={3.1}
              fontWeight={700}
              fill="#334155"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              РН-263Т
            </text>
            {/* Digital LED display */}
            <rect x={4.5} y={27} width={width - 9} height={15} rx={1.5} fill="#0f172a" />
            <text
              x={width / 2}
              y={37.5}
              fontSize={8.2}
              fontWeight={700}
              fill="#ef4444"
              textAnchor="middle"
              fontFamily="monospace"
            >
              230
            </text>
            <text
              x={width - 6.5}
              y={31.2}
              fontSize={2.6}
              fill="#22c55e"
              textAnchor="end"
              fontFamily="monospace"
            >
              V
            </text>
            {/* Control buttons */}
            <circle cx={9.5} cy={48.5} r={2.8} fill="#cbd5e1" stroke="#475569" strokeWidth={0.5} />
            <circle cx={18} cy={48.5} r={2.8} fill="#cbd5e1" stroke="#475569" strokeWidth={0.5} />
            <circle cx={26.5} cy={48.5} r={2.8} fill="#cbd5e1" stroke="#475569" strokeWidth={0.5} />
            <text x={9.5} y={49.7} fontSize={3.2} fill="#0f172a" textAnchor="middle">
              -
            </text>
            <text x={18} y={49.5} fontSize={2.4} fill="#0f172a" textAnchor="middle">
              SET
            </text>
            <text x={26.5} y={49.7} fontSize={3.2} fill="#0f172a" textAnchor="middle">
              +
            </text>
            <text
              x={width / 2}
              y={60.5}
              fontSize={4}
              fontWeight={700}
              fill="#0f172a"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {item.designation}
            </text>
          </g>
        )}

        {/* Contactor */}
        {isContactor && (
          <g>
            <text
              x={3.2}
              y={25.5}
              fontSize={3.5}
              fontWeight={700}
              fill="#dc2626"
              fontFamily="sans-serif"
            >
              {def.brand}
            </text>
            <text
              x={width - 3.2}
              y={25.5}
              fontSize={2.8}
              fontWeight={600}
              fill="#475569"
              textAnchor="end"
              fontFamily="monospace"
            >
              {item.rating}
            </text>
            {/* Mechanical position flag */}
            <rect
              x={width / 2 - 6}
              y={30}
              width={12}
              height={10}
              rx={1}
              fill="#334155"
              stroke="#0f172a"
              strokeWidth={0.5}
            />
            <rect x={width / 2 - 4} y={32} width={8} height={3.5} rx={0.5} fill="#f97316" />
            {/* Coil / contact schematic */}
            <rect
              x={6}
              y={44}
              width={width - 12}
              height={10}
              rx={1}
              fill="#f1f5f9"
              stroke="#cbd5e1"
              strokeWidth={0.4}
            />
            <text
              x={width / 2}
              y={50.5}
              fontSize={3.2}
              fill="#475569"
              textAnchor="middle"
              fontFamily="monospace"
            >
              1-2 | 3-4 | A1-A2
            </text>
            <text
              x={width / 2}
              y={61}
              fontSize={4}
              fontWeight={700}
              fill="#0f172a"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {item.designation}
            </text>
          </g>
        )}

        {/* Terminals N / PE */}
        {isTerminal && (
          <g>
            <rect
              x={2.5}
              y={27}
              width={width - 5}
              height={30}
              rx={1.5}
              fill="#0f172a"
              opacity={0.22}
            />
            <text
              x={width / 2}
              y={40}
              fontSize={5.2}
              fontWeight={800}
              fill="#ffffff"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {item.componentId === 'terminal-n' ? 'N' : 'PE'}
            </text>
            <text
              x={width / 2}
              y={49}
              fontSize={3.6}
              fontWeight={700}
              fill="#ffffff"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {item.designation}
            </text>
          </g>
        )}

        {/* Cross-Module 4P */}
        {isCross && (
          <g>
            <text
              x={4}
              y={24.5}
              fontSize={3.3}
              fontWeight={700}
              fill="#0f172a"
              fontFamily="sans-serif"
            >
              {item.designation} · КРОСС-МОДУЛЬ 4×7
            </text>
            {/* 4 Brass busbars inside transparent cover */}
            {[
              { yBar: 28, color: '#92400e', label: 'L1' },
              { yBar: 36, color: '#1e293b', label: 'L2' },
              { yBar: 44, color: '#64748b', label: 'L3' },
              { yBar: 52, color: '#2563eb', label: 'N' },
            ].map((bar) => (
              <g key={bar.label}>
                <rect x={4} y={bar.yBar} width={width - 8} height={5.5} rx={1} fill={bar.color} opacity={0.85} />
                <text
                  x={7.5}
                  y={bar.yBar + 4}
                  fontSize={3.1}
                  fontWeight={700}
                  fill="#ffffff"
                  fontFamily="monospace"
                >
                  {bar.label}
                </text>
                {[18, 26, 34, 42, 50, 58, 64].map((sx) => (
                  <circle key={sx} cx={sx} cy={bar.yBar + 2.75} r={1.6} fill="#fbbf24" stroke="#78350f" strokeWidth={0.4} />
                ))}
              </g>
            ))}
          </g>
        )}

        {/* Selection highlight ring */}
        {isSelected && (
          <rect
            x={-1}
            y={-1}
            width={width + 2}
            height={height + 2}
            rx={2.5}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1.6}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        )}

        {/* Consumer label pill below/on module if labels layer is visible */}
        {showLabels && item.label && (
          <g pointerEvents="none">
            <rect
              x={0.5}
              y={height + 1.5}
              width={width - 1}
              height={7.5}
              rx={1.2}
              fill="#0f172a"
              fillOpacity={0.86}
              stroke="#334155"
              strokeWidth={0.4}
            />
            <text
              x={width / 2}
              y={height + 6.5}
              fontSize={3.2}
              fontWeight={600}
              fill="#e2e8f0"
              textAnchor="middle"
              fontFamily="Inter, sans-serif"
            >
              {item.label.length > def.widthModules * 7
                ? item.label.slice(0, def.widthModules * 7 - 1) + '…'
                : item.label}
            </text>
          </g>
        )}

        {/* === TERMINAL PORTS === */}
        {def.ports.map((port) => {
          const px = width * port.offsetFraction;
          const py = port.side === 'top' ? MODULE_HEIGHT_MM / 2 - PORT_Y_OFFSET : MODULE_HEIGHT_MM / 2 + PORT_Y_OFFSET;
          const isStart = wireStart?.itemId === item.id && wireStart?.portId === port.id;
          const isHover = hoveredPort?.itemId === item.id && hoveredPort?.portId === port.id;

          const ringColor =
            port.type === 'N'
              ? '#3b82f6'
              : port.type === 'PE'
              ? '#22c55e'
              : port.type === 'signal'
              ? '#f97316'
              : '#64748b';

          return (
            <g
              key={port.id}
              transform={`translate(${px}, ${py})`}
              className={mode === 'wire' ? 'cursor-pointer' : ''}
              onClick={(e) => {
                if (mode === 'wire') {
                  e.stopPropagation();
                  onPortClick(e, item.id, port.id);
                }
              }}
              onPointerDown={(e) => {
                if (mode === 'wire') e.stopPropagation();
              }}
              onMouseEnter={() => {
                if (mode === 'wire') onPortHover({ itemId: item.id, portId: port.id });
              }}
              onMouseLeave={() => {
                if (mode === 'wire') onPortHover(null);
              }}
            >
              {/* Larger invisible hit target in Wire mode */}
              {mode === 'wire' && <circle r={6.2} fill="transparent" />}

              {/* Active / Hover glow */}
              {(isStart || (mode === 'wire' && isHover)) && (
                <circle
                  r={5.2}
                  fill={isStart ? '#38bdf8' : '#facc15'}
                  opacity={0.35}
                />
              )}

              {/* Screw terminal */}
              <circle
                r={2.9}
                fill={isStart ? '#38bdf8' : isHover && mode === 'wire' ? '#fde047' : '#e2e8f0'}
                stroke={isStart ? '#0284c7' : ringColor}
                strokeWidth={isStart || (isHover && mode === 'wire') ? 1.2 : 0.85}
              />
              {/* Screw slot */}
              <line x1={-1.5} y1={-1.5} x2={1.5} y2={1.5} stroke="#475569" strokeWidth={0.6} />

              {/* Port label */}
              <text
                x={0}
                y={port.side === 'top' ? 6.4 : -4.4}
                fontSize={2.7}
                fontWeight={700}
                fill={isTerminal ? '#ffffff' : '#334155'}
                textAnchor="middle"
                fontFamily="monospace"
                pointerEvents="none"
              >
                {port.label}
              </text>
            </g>
          );
        })}

        {/* Unused variable guard */}
        {railY < 0 && null}
      </g>
    );
  }
);


// ============================================================================
// AI ASSISTANT (GROQ) TYPES & ACTION ENGINE
// ============================================================================

type AiAction =
  | {
      type: 'add_item';
      componentId: string;
      railId?: number;
      slotIndex?: number;
      designation?: string;
      rating?: string;
      label?: string;
    }
  | {
      type: 'update_item';
      designation: string;
      patch: Partial<Pick<PlacedItem, 'designation' | 'rating' | 'label' | 'article' | 'price' | 'laborCost' | 'railId' | 'slotIndex'>>;
    }
  | {
      type: 'remove_item';
      designation: string;
    }
  | {
      type: 'add_wire';
      fromDesignation: string;
      fromPort: string;
      toDesignation: string;
      toPort: string;
      color?: WireColorKey;
      section?: WireSection;
      layer?: WireLayer;
    }
  | {
      type: 'remove_wire';
      fromDesignation: string;
      toDesignation: string;
      fromPort?: string;
      toPort?: string;
    };

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  appliedCount?: number;
  isError?: boolean;
}

const GROQ_KEY_STORAGE = 'panel_cad_groq_key_v1';

function buildAiSystemPrompt(doc: PanelDocument): string {
  const catalogSummary = COMPONENT_LIBRARY.map((c) => ({
    id: c.id,
    name: c.name,
    widthModules: c.widthModules,
    defaultPrefix: c.defaultPrefix,
    ports: c.ports.map((p) => `${p.id}(${p.label},${p.side},${p.type})`),
  }));

  const currentItems = doc.items.map((it) => ({
    designation: it.designation,
    componentId: it.componentId,
    railId: it.railId,
    slotIndex: it.slotIndex,
    rating: it.rating,
    label: it.label,
  }));

  const itemById = new Map(doc.items.map((i) => [i.id, i.designation]));
  const currentWires = doc.wires.map((w) => ({
    from: `${itemById.get(w.from.itemId) ?? w.from.itemId}:${w.from.portId}`,
    to: `${itemById.get(w.to.itemId) ?? w.to.itemId}:${w.to.portId}`,
    color: w.color,
    section: w.section,
    layer: w.layer,
  }));

  return `Ты — инженер-проектировщик электрических щитов в 2D САПР ЩитCAD.
Отвечай СТРОГО в формате JSON:
{
  "reply": "Краткий ответ на русском, что именно ты сделал",
  "actions": [ ... ]
}

Доступные типы actions:
1. {"type":"add_item","componentId":"<id из каталога>","railId":0..2,"slotIndex":0..17,"designation":"QF5","rating":"C16","label":"Подпись"}
2. {"type":"update_item","designation":"QF2","patch":{"rating":"C20","label":"Новая подпись"}}
3. {"type":"remove_item","designation":"KM1"}
4. {"type":"add_wire","fromDesignation":"FD1","fromPort":"2","toDesignation":"QF5","toPort":"1","color":"L1|L2|L3|N|PE|control","section":1.5|2.5|4|6,"layer":"power|control"}
5. {"type":"remove_wire","fromDesignation":"QF4","toDesignation":"KM1"}

Каталог компонентов (используй только эти componentId и port id):
${JSON.stringify(catalogSummary)}

Текущие модули в щите (3 рейки: railId 0, 1, 2; слоты 0..17):
${JSON.stringify(currentItems)}

Текущие провода:
${JSON.stringify(currentWires)}

Правила:
- Используй только существующие componentId и точные id клемм из каталога.
- Для силовых фазных соединений используй L1/L2/L3 (обычно 4 или 6 мм²), для нуля N (синий), для земли PE, для цепей управления control (1.5 мм², layer:"control").
- Если пользователь просит добавить и подключить устройство, сначала добавь add_item с уникальным designation, затем add_wire с этим же designation.
- Если пользователь просто задаёт вопрос без правок, верни "actions": [].`;
}

function resolvePortId(def: ComponentDef, rawPort: string): string | null {
  const norm = rawPort.trim().toLowerCase();
  const byId = def.ports.find((p) => p.id.toLowerCase() === norm);
  if (byId) return byId.id;
  const byLabel = def.ports.find((p) => p.label.toLowerCase() === norm);
  if (byLabel) return byLabel.id;
  return def.ports[0]?.id ?? null;
}

function applyAiActions(
  prev: PanelDocument,
  actions: AiAction[]
): { nextDoc: PanelDocument; appliedCount: number } {
  let items = [...prev.items];
  let wires = [...prev.wires];
  let appliedCount = 0;

  for (const act of actions) {
    if (!act || typeof act !== 'object') continue;

    if (act.type === 'add_item') {
      const def = COMPONENT_MAP[act.componentId];
      if (!def) continue;

      let railId = typeof act.railId === 'number' ? act.railId : 0;
      let slotIndex = typeof act.slotIndex === 'number' ? act.slotIndex : 0;
      if (!canPlaceAt(items, railId, slotIndex, def.widthModules)) {
        const free = findFirstFreeSlot(items, def.widthModules);
        if (!free) continue;
        railId = free.railId;
        slotIndex = free.slotIndex;
      }

      const designation =
        act.designation && !items.some((i) => i.designation.toLowerCase() === act.designation!.toLowerCase())
          ? act.designation
          : getNextDesignation(items, def.defaultPrefix);

      const newItem: PlacedItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        componentId: def.id,
        railId,
        slotIndex,
        designation,
        rating: act.rating || def.defaultRating,
        label: act.label || def.defaultLabel,
        article: def.article,
        price: def.price,
        laborCost: def.laborCost,
      };
      items = [...items, newItem];
      appliedCount += 1;
    } else if (act.type === 'update_item') {
      const idx = items.findIndex(
        (i) => i.designation.toLowerCase() === String(act.designation || '').toLowerCase()
      );
      if (idx === -1 || !act.patch) continue;
      const target = items[idx];
      const def = COMPONENT_MAP[target.componentId];
      const nextPatch = { ...act.patch };
      if (
        (typeof nextPatch.railId === 'number' || typeof nextPatch.slotIndex === 'number') &&
        def
      ) {
        const r = typeof nextPatch.railId === 'number' ? nextPatch.railId : target.railId;
        const s = typeof nextPatch.slotIndex === 'number' ? nextPatch.slotIndex : target.slotIndex;
        if (!canPlaceAt(items, r, s, def.widthModules, target.id)) {
          delete nextPatch.railId;
          delete nextPatch.slotIndex;
        }
      }
      items[idx] = { ...target, ...nextPatch };
      appliedCount += 1;
    } else if (act.type === 'remove_item') {
      const target = items.find(
        (i) => i.designation.toLowerCase() === String(act.designation || '').toLowerCase()
      );
      if (!target) continue;
      items = items.filter((i) => i.id !== target.id);
      wires = wires.filter((w) => w.from.itemId !== target.id && w.to.itemId !== target.id);
      appliedCount += 1;
    } else if (act.type === 'add_wire') {
      const fromItem = items.find(
        (i) => i.designation.toLowerCase() === String(act.fromDesignation || '').toLowerCase()
      );
      const toItem = items.find(
        (i) => i.designation.toLowerCase() === String(act.toDesignation || '').toLowerCase()
      );
      if (!fromItem || !toItem) continue;
      const fromDef = COMPONENT_MAP[fromItem.componentId];
      const toDef = COMPONENT_MAP[toItem.componentId];
      if (!fromDef || !toDef) continue;
      const fromPort = resolvePortId(fromDef, String(act.fromPort || ''));
      const toPort = resolvePortId(toDef, String(act.toPort || ''));
      if (!fromPort || !toPort) continue;

      const validColor: WireColorKey =
        act.color && act.color in WIRE_COLORS ? act.color : 'L1';
      const validSection: WireSection =
        act.section && WIRE_SECTIONS.includes(act.section) ? act.section : 2.5;
      const validLayer: WireLayer =
        act.layer === 'control' || act.layer === 'power'
          ? act.layer
          : WIRE_COLORS[validColor].defaultLayer;

      const newWire: Wire = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: { itemId: fromItem.id, portId: fromPort },
        to: { itemId: toItem.id, portId: toPort },
        color: validColor,
        section: validSection,
        layer: validLayer,
      };
      wires = [...wires, newWire];
      appliedCount += 1;
    } else if (act.type === 'remove_wire') {
      const fromItem = items.find(
        (i) => i.designation.toLowerCase() === String(act.fromDesignation || '').toLowerCase()
      );
      const toItem = items.find(
        (i) => i.designation.toLowerCase() === String(act.toDesignation || '').toLowerCase()
      );
      if (!fromItem || !toItem) continue;
      const beforeLen = wires.length;
      wires = wires.filter((w) => {
        const matchFwd = w.from.itemId === fromItem.id && w.to.itemId === toItem.id;
        const matchRev = w.from.itemId === toItem.id && w.to.itemId === fromItem.id;
        return !(matchFwd || matchRev);
      });
      if (wires.length < beforeLen) appliedCount += 1;
    }
  }

  return {
    nextDoc: { ...prev, items, wires },
    appliedCount,
  };
}

// ============================================================================
// MAIN APPLICATION
// ============================================================================

export default function App() {
  // Load initial document safely from localStorage
  const loadInitialDoc = (): PanelDocument => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && Array.isArray(parsed.wires)) {
          return {
            items: parsed.items,
            wires: parsed.wires,
            terminationCostPerEnd:
              typeof parsed.terminationCostPerEnd === 'number' ? parsed.terminationCostPerEnd : 120,
          };
        }
      }
    } catch {
      // ignore storage errors in restricted environments
    }
    return createDemoDocument();
  };

  // Document state with Undo / Redo history
  const [doc, setDoc] = useState<PanelDocument>(loadInitialDoc);
  const [past, setPast] = useState<PanelDocument[]>([]);
  const [future, setFuture] = useState<PanelDocument[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<EditorTab>('editor');
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectedItemId, setSelectedItemId] = useState<string | null>('item-qf1');
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [layers, setLayers] = useState<LayerVisibility>({
    rails: true,
    modules: true,
    powerWires: true,
    controlWires: true,
    labels: true,
  });

  // Mobile/narrow panel visibility toggles
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Toast notifications
  const [toast, setToast] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ text, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  // Wire creation state
  const [wireStart, setWireStart] = useState<WireEndpoint | null>(null);
  const [hoveredPort, setHoveredPort] = useState<WireEndpoint | null>(null);
  const [mouseWorld, setMouseWorld] = useState<Point | null>(null);
  const [newWireSection, setNewWireSection] = useState<WireSection>(2.5);

  // SVG Pan & Zoom state
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.45);
  const [pan, setPan] = useState<Point>({ x: 40, y: 18 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(
    null
  );

  // Dragging existing module state
  const [dragState, setDragState] = useState<{
    itemId: string;
    initialDoc: PanelDocument;
    offsetSlots: number;
    hoverRail: number;
    hoverSlot: number;
    isValid: boolean;
    moved: boolean;
  } | null>(null);

  // Dragging new component from palette onto canvas
  const [paletteGhost, setPaletteGhost] = useState<{
    componentId: string;
    railId: number;
    slotIndex: number;
    isValid: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Autosave to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      // ignore
    }
  }, [doc]);

  // History helper
  const commitDoc = useCallback((updater: (prev: PanelDocument) => PanelDocument) => {
    setDoc((prev) => {
      const next = updater(prev);
      setPast((p) => [...p.slice(-39), prev]);
      setFuture([]);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [doc, ...f.slice(0, 39)]);
      setDoc(previous);
      return p.slice(0, -1);
    });
  }, [doc]);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p.slice(-39), doc]);
      setDoc(next);
      return f.slice(1);
    });
  }, [doc]);

  // Fit panel to container
  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pad = 28;
    const scaleX = (rect.width - pad * 2) / PANEL_WIDTH_MM;
    const scaleY = (rect.height - pad * 2) / PANEL_HEIGHT_MM;
    const nextZoom = Math.max(0.6, Math.min(3.5, Math.min(scaleX, scaleY)));
    const nextPanX = (rect.width - PANEL_WIDTH_MM * nextZoom) / 2;
    const nextPanY = (rect.height - PANEL_HEIGHT_MM * nextZoom) / 2;
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(fitToView, 50);
    return () => window.clearTimeout(timer);
  }, [fitToView]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape') {
        setWireStart(null);
        setSelectedItemId(null);
        setSelectedWireId(null);
      } else if (e.key.toLowerCase() === 'v') {
        setMode('select');
        setWireStart(null);
      } else if (e.key.toLowerCase() === 'w') {
        setMode('wire');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemId) {
          e.preventDefault();
          commitDoc((prev) => ({
            ...prev,
            items: prev.items.filter((i) => i.id !== selectedItemId),
            wires: prev.wires.filter(
              (w) => w.from.itemId !== selectedItemId && w.to.itemId !== selectedItemId
            ),
          }));
          setSelectedItemId(null);
        } else if (selectedWireId) {
          e.preventDefault();
          commitDoc((prev) => ({
            ...prev,
            wires: prev.wires.filter((w) => w.id !== selectedWireId),
          }));
          setSelectedWireId(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, selectedItemId, selectedWireId, commitDoc]);

  // Coordinate conversions
  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = containerRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const worldToSlot = useCallback((world: Point, widthModules: number): { railId: number; slotIndex: number } => {
    // Closest DIN rail by Y
    let bestRail = 0;
    let bestDist = Infinity;
    RAIL_CENTERS_Y.forEach((ry, idx) => {
      const d = Math.abs(world.y - ry);
      if (d < bestDist) {
        bestDist = d;
        bestRail = idx;
      }
    });
    const rawSlot = Math.round((world.x - RAIL_START_X) / MODULE_MM);
    const slotIndex = Math.max(0, Math.min(SLOTS_PER_RAIL - widthModules, rawSlot));
    return { railId: bestRail, slotIndex };
  }, []);

  // Routed wires (recomputed instantaneously whenever items or wires change)
  const routedWires = useMemo(() => computeRoutedWires(doc.items, doc.wires), [doc.items, doc.wires]);

  // Add component by click
  const handleAddComponentClick = useCallback(
    (componentId: string) => {
      const def = COMPONENT_MAP[componentId];
      if (!def) return;
      const free = findFirstFreeSlot(doc.items, def.widthModules);
      if (!free) {
        showToast('Нет свободного места на DIN-рейках для этого модуля', 'err');
        return;
      }
      const newItem: PlacedItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        componentId: def.id,
        railId: free.railId,
        slotIndex: free.slotIndex,
        designation: getNextDesignation(doc.items, def.defaultPrefix),
        rating: def.defaultRating,
        label: def.defaultLabel,
        article: def.article,
        price: def.price,
        laborCost: def.laborCost,
      };
      commitDoc((prev) => ({ ...prev, items: [...prev.items, newItem] }));
      setSelectedItemId(newItem.id);
      setSelectedWireId(null);
      setActiveTab('editor');
      showToast(`Добавлен ${newItem.designation} (${def.shortName})`);
    },
    [doc.items, commitDoc, showToast]
  );

  // Canvas wheel zoom centered at pointer
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = Math.max(0.55, Math.min(4.8, zoom * factor));
      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      setZoom(nextZoom);
      setPan({
        x: mouseX - worldX * nextZoom,
        y: mouseY - worldY * nextZoom,
      });
    },
    [zoom, pan]
  );

  // Pointer down on canvas background (panning or deselecting)
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && mode === 'select')) {
      setIsPanning(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      if (e.button === 0) {
        setSelectedItemId(null);
        setSelectedWireId(null);
      }
    } else if (e.button === 2 && wireStart) {
      e.preventDefault();
      setWireStart(null);
    }
  };

  // Pointer down on a module
  const handlePointerDownModule = useCallback(
    (e: React.PointerEvent, item: PlacedItem) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setSelectedItemId(item.id);
      setSelectedWireId(null);

      if (mode !== 'select') return;
      const world = clientToWorld(e.clientX, e.clientY);
      const clickSlotOffset = Math.floor((world.x - (RAIL_START_X + item.slotIndex * MODULE_MM)) / MODULE_MM);

      setDragState({
        itemId: item.id,
        initialDoc: doc,
        offsetSlots: Math.max(0, clickSlotOffset),
        hoverRail: item.railId,
        hoverSlot: item.slotIndex,
        isValid: true,
        moved: false,
      });
    },
    [mode, clientToWorld, doc]
  );

  // Pointer move on canvas
  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    const world = clientToWorld(e.clientX, e.clientY);
    if (mode === 'wire' && wireStart) {
      setMouseWorld(world);
    }

    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    if (dragState) {
      const draggedItem = doc.items.find((i) => i.id === dragState.itemId);
      if (!draggedItem) return;
      const def = COMPONENT_MAP[draggedItem.componentId];
      const w = def ? def.widthModules : 1;

      const shiftedWorld = { x: world.x - dragState.offsetSlots * MODULE_MM, y: world.y };
      const { railId, slotIndex } = worldToSlot(shiftedWorld, w);
      const valid = canPlaceAt(doc.items, railId, slotIndex, w, draggedItem.id);

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              hoverRail: railId,
              hoverSlot: slotIndex,
              isValid: valid,
              moved: prev.moved || railId !== draggedItem.railId || slotIndex !== draggedItem.slotIndex,
            }
          : null
      );

      // Live snap! Immediately update position so all connected wires re-route in real time
      if (valid && (railId !== draggedItem.railId || slotIndex !== draggedItem.slotIndex)) {
        setDoc((prev) => ({
          ...prev,
          items: prev.items.map((it) =>
            it.id === dragState.itemId ? { ...it, railId, slotIndex } : it
          ),
        }));
      }
    }
  };

  // Pointer up on canvas
  const handleCanvasPointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (dragState) {
      if (dragState.moved) {
        const initItem = dragState.initialDoc.items.find((i) => i.id === dragState.itemId);
        const currItem = doc.items.find((i) => i.id === dragState.itemId);
        if (
          initItem &&
          currItem &&
          (initItem.railId !== currItem.railId || initItem.slotIndex !== currItem.slotIndex)
        ) {
          setPast((p) => [...p.slice(-39), dragState.initialDoc]);
          setFuture([]);
        }
      }
      setDragState(null);
    }
  };

  // Port click handler for Wire creation
  const handlePortClick = useCallback(
    (_e: React.MouseEvent, itemId: string, portId: string) => {
      if (mode !== 'wire') return;

      if (!wireStart) {
        setWireStart({ itemId, portId });
        return;
      }

      // Prevent self-connection to exact same port
      if (wireStart.itemId === itemId && wireStart.portId === portId) {
        setWireStart(null);
        return;
      }

      // Determine smart default wire color and layer from port types
      const fromItem = doc.items.find((i) => i.id === wireStart.itemId);
      const toItem = doc.items.find((i) => i.id === itemId);
      const fromDef = fromItem ? COMPONENT_MAP[fromItem.componentId] : null;
      const toDef = toItem ? COMPONENT_MAP[toItem.componentId] : null;
      const fromPort = fromDef?.ports.find((p) => p.id === wireStart.portId);
      const toPort = toDef?.ports.find((p) => p.id === portId);

      const priorityType: PortType =
        fromPort?.type === 'PE' || toPort?.type === 'PE'
          ? 'PE'
          : fromPort?.type === 'signal' || toPort?.type === 'signal'
          ? 'signal'
          : fromPort?.type === 'N' || toPort?.type === 'N'
          ? 'N'
          : 'L';

      const { color, layer } = inferWireColorFromPort(priorityType);
      const section: WireSection = layer === 'control' ? 1.5 : newWireSection;

      const newWire: Wire = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        from: wireStart,
        to: { itemId, portId },
        color,
        section,
        layer,
      };

      commitDoc((prev) => ({ ...prev, wires: [...prev.wires, newWire] }));
      setWireStart(null);
      setSelectedWireId(newWire.id);
      setSelectedItemId(null);
      showToast(
        `Провод ${fromItem?.designation}:${fromPort?.label ?? wireStart.portId} → ${toItem?.designation}:${toPort?.label ?? portId}`
      );
    },
    [mode, wireStart, doc.items, newWireSection, commitDoc, showToast]
  );

  // HTML5 Drag & Drop from Left Palette onto SVG Canvas
  const handlePaletteDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const componentId = e.dataTransfer.getData('text/plain') || paletteGhost?.componentId;
    if (!componentId || !COMPONENT_MAP[componentId]) return;
    const def = COMPONENT_MAP[componentId];
    const world = clientToWorld(e.clientX, e.clientY);
    const { railId, slotIndex } = worldToSlot(
      { x: world.x - ((def.widthModules - 1) * MODULE_MM) / 2, y: world.y },
      def.widthModules
    );
    const isValid = canPlaceAt(doc.items, railId, slotIndex, def.widthModules);
    setPaletteGhost({ componentId, railId, slotIndex, isValid });
  };

  const handlePaletteDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const componentId = e.dataTransfer.getData('text/plain') || paletteGhost?.componentId;
    setPaletteGhost(null);
    if (!componentId || !COMPONENT_MAP[componentId]) return;
    const def = COMPONENT_MAP[componentId];
    const world = clientToWorld(e.clientX, e.clientY);
    const { railId, slotIndex } = worldToSlot(
      { x: world.x - ((def.widthModules - 1) * MODULE_MM) / 2, y: world.y },
      def.widthModules
    );
    if (!canPlaceAt(doc.items, railId, slotIndex, def.widthModules)) {
      showToast('Слот занят или недостаточно места на рейке', 'err');
      return;
    }
    const newItem: PlacedItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      componentId: def.id,
      railId,
      slotIndex,
      designation: getNextDesignation(doc.items, def.defaultPrefix),
      rating: def.defaultRating,
      label: def.defaultLabel,
      article: def.article,
      price: def.price,
      laborCost: def.laborCost,
    };
    commitDoc((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setSelectedItemId(newItem.id);
    setSelectedWireId(null);
    showToast(`Установлен ${newItem.designation} на рейку ${railId + 1}`);
  };

  // Export / Import JSON
  const handleExportJson = () => {
    downloadFile(
      JSON.stringify(doc, null, 2),
      `shield-project-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8'
    );
    showToast('Проект сохранён в JSON');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.items) || !Array.isArray(parsed.wires)) {
          throw new Error('Неверный формат файла');
        }
        commitDoc(() => ({
          items: parsed.items,
          wires: parsed.wires,
          terminationCostPerEnd:
            typeof parsed.terminationCostPerEnd === 'number' ? parsed.terminationCostPerEnd : 120,
        }));
        setSelectedItemId(null);
        setSelectedWireId(null);
        showToast(`Импортировано: ${parsed.items.length} модулей, ${parsed.wires.length} проводов`);
      } catch {
        showToast('Ошибка чтения JSON: проверьте формат файла', 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResetDemo = () => {
    commitDoc(() => createDemoDocument());
    setSelectedItemId('item-qf1');
    setSelectedWireId(null);
    setWireStart(null);
    showToast('Восстановлен демо-щит');
  };

  // AI Assistant (Groq) state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [groqKey, setGroqKey] = useState<string>(() => {
    try {
      return localStorage.getItem(GROQ_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Привет! Я ИИ-инженер на базе Groq (Llama 3.3 70B). Напишите, какие модули добавить, переименовать или соединить проводами — я сразу обновлю схему.',
    },
  ]);

  const handleSaveGroqKey = (val: string) => {
    setGroqKey(val);
    try {
      localStorage.setItem(GROQ_KEY_STORAGE, val);
    } catch {
      // ignore
    }
  };

  const handleSendAiPrompt = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? aiInput).trim();
    if (!prompt || aiLoading) return;
    setAiInput('');
    const userMsg: AiMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: prompt,
    };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiLoading(true);

    try {
      let data: { reply?: string; actions?: AiAction[]; error?: string };

      if (groqKey.trim()) {
        // Direct browser call to Groq OpenAI-compatible API when user supplies their own key
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey.trim()}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.15,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: buildAiSystemPrompt(doc) },
              { role: 'user', content: prompt },
            ],
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Groq API (${res.status}): ${errText.slice(0, 160)}`);
        }
        const raw = await res.json();
        const content = raw?.choices?.[0]?.message?.content || '{}';
        data = JSON.parse(content);
      } else {
        // Default: call Vercel Serverless Function /api/ai (uses server-side GROQ_API_KEY)
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            systemPrompt: buildAiSystemPrompt(doc),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            errBody.error ||
              'Сервер /api/ai недоступен. На Vercel добавьте переменную GROQ_API_KEY или введите ключ Groq в настройках (⚙️) выше.'
          );
        }
        data = await res.json();
      }

      const actions = Array.isArray(data.actions) ? data.actions : [];
      let appliedCount = 0;
      if (actions.length > 0) {
        const resApply = applyAiActions(doc, actions);
        appliedCount = resApply.appliedCount;
        if (appliedCount > 0) {
          commitDoc(() => resApply.nextDoc);
          showToast(`ИИ выполнил действий: ${appliedCount}`);
        }
      }

      setAiMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.reply || (appliedCount > 0 ? 'Готово, схема обновлена.' : 'Изменения не потребовались.'),
          appliedCount,
        },
      ]);
    } catch (err: any) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: err?.message || 'Ошибка обращения к ИИ',
          isError: true,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Selected entities
  const selectedItem = useMemo(
    () => doc.items.find((i) => i.id === selectedItemId) ?? null,
    [doc.items, selectedItemId]
  );

  const selectedRoutedWire = useMemo(
    () => routedWires.find((rw) => rw.wire.id === selectedWireId) ?? null,
    [routedWires, selectedWireId]
  );

  // Filtered palette components
  const filteredComponents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COMPONENT_LIBRARY;
    return COMPONENT_LIBRARY.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.article.toLowerCase().includes(q) ||
        c.defaultPrefix.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Update selected item property
  const updateSelectedItem = (patch: Partial<PlacedItem>) => {
    if (!selectedItemId) return;
    commitDoc((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === selectedItemId ? { ...it, ...patch } : it)),
    }));
  };

  // Nudge selected module left/right
  const nudgeSelectedItem = (delta: number) => {
    if (!selectedItem) return;
    const def = COMPONENT_MAP[selectedItem.componentId];
    const w = def ? def.widthModules : 1;
    const targetSlot = selectedItem.slotIndex + delta;
    if (canPlaceAt(doc.items, selectedItem.railId, targetSlot, w, selectedItem.id)) {
      commitDoc((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === selectedItem.id ? { ...it, slotIndex: targetSlot } : it
        ),
      }));
    }
  };

  // Update selected wire property
  const updateSelectedWire = (patch: Partial<Wire>) => {
    if (!selectedWireId) return;
    commitDoc((prev) => ({
      ...prev,
      wires: prev.wires.map((w) => (w.id === selectedWireId ? { ...w, ...patch } : w)),
    }));
  };

  // ============================================================================
  // REPORTS COMPUTATION (BOM, CABLE JOURNAL, PLASTRON LABELS)
  // ============================================================================

  const bomData = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        name: string;
        brand: string;
        article: string;
        widthModules: number;
        qty: number;
        unitPrice: number;
        unitLabor: number;
        designations: string[];
      }
    >();

    for (const item of doc.items) {
      const def = COMPONENT_MAP[item.componentId];
      if (!def) continue;
      const key = `${item.componentId}|${item.article}|${item.price}|${item.laborCost}`;
      const existing = groups.get(key);
      if (existing) {
        existing.qty += 1;
        existing.designations.push(item.designation);
      } else {
        groups.set(key, {
          key,
          name: def.name,
          brand: def.brand,
          article: item.article,
          widthModules: def.widthModules,
          qty: 1,
          unitPrice: item.price,
          unitLabor: item.laborCost,
          designations: [item.designation],
        });
      }
    }

    const rows = Array.from(groups.values());
    const equipmentTotal = rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
    const moduleLaborTotal = rows.reduce((s, r) => s + r.qty * r.unitLabor, 0);
    const wireEndsCount = doc.wires.length * 2;
    const wireLaborTotal = wireEndsCount * doc.terminationCostPerEnd;
    const totalLabor = moduleLaborTotal + wireLaborTotal;
    const grandTotal = equipmentTotal + totalLabor;

    return {
      rows,
      equipmentTotal,
      moduleLaborTotal,
      wireEndsCount,
      wireLaborTotal,
      totalLabor,
      grandTotal,
    };
  }, [doc.items, doc.wires.length, doc.terminationCostPerEnd]);

  const cableJournalRows = useMemo(() => {
    const itemMap = new Map(doc.items.map((it) => [it.id, it]));
    return routedWires.map((rw, idx) => {
      const fromItem = itemMap.get(rw.wire.from.itemId);
      const toItem = itemMap.get(rw.wire.to.itemId);
      const fromPort = fromItem
        ? COMPONENT_MAP[fromItem.componentId]?.ports.find((p) => p.id === rw.wire.from.portId)
        : null;
      const toPort = toItem
        ? COMPONENT_MAP[toItem.componentId]?.ports.find((p) => p.id === rw.wire.to.portId)
        : null;

      return {
        index: idx + 1,
        id: rw.wire.id,
        fromLabel: `${fromItem?.designation ?? '?'}:${fromPort?.label ?? rw.wire.from.portId}`,
        toLabel: `${toItem?.designation ?? '?'}:${toPort?.label ?? rw.wire.to.portId}`,
        colorKey: rw.wire.color,
        colorInfo: WIRE_COLORS[rw.wire.color],
        section: rw.wire.section,
        layer: rw.wire.layer,
        rawLengthMm: rw.rawLengthMm,
        totalLengthMm: rw.totalLengthMm,
      };
    });
  }, [doc.items, routedWires]);

  const handleExportBomCsv = () => {
    const header = [
      'Наименование',
      'Производитель',
      'Артикул',
      'Позиции',
      'Модули',
      'Кол-во',
      'Цена ед. (₽)',
      'Сумма оборуд. (₽)',
      'Монтаж ед. (₽)',
      'Сумма монтаж (₽)',
    ];
    const lines = [header.join(';')];
    for (const r of bomData.rows) {
      lines.push(
        [
          `"${r.name}"`,
          `"${r.brand}"`,
          `"${r.article}"`,
          `"${r.designations.join(', ')}"`,
          r.widthModules,
          r.qty,
          r.unitPrice,
          r.qty * r.unitPrice,
          r.unitLabor,
          r.qty * r.unitLabor,
        ].join(';')
      );
    }
    lines.push(
      [
        `"Расключение проводов (${bomData.wireEndsCount} концов)"`,
        '""',
        '""',
        '""',
        0,
        bomData.wireEndsCount,
        0,
        0,
        doc.terminationCostPerEnd,
        bomData.wireLaborTotal,
      ].join(';')
    );
    lines.push(
      [
        '"ИТОГО"',
        '""',
        '""',
        '""',
        '',
        '',
        '',
        bomData.equipmentTotal,
        '',
        bomData.totalLabor,
      ].join(';')
    );
    lines.push(`"ОБЩАЯ СТОИМОСТЬ СБОРКИ И ОБОРУДОВАНИЯ";;;;;;;${bomData.grandTotal}`);
    downloadFile('\uFEFF' + lines.join('\n'), 'specification-estimate.csv', 'text/csv;charset=utf-8');
    showToast('Спецификация выгружена в CSV');
  };

  const handleExportCablesCsv = () => {
    const header = [
      '№',
      'Откуда',
      'Куда',
      'Цвет',
      'Сечение (мм²)',
      'Слой',
      'Длина трассы (мм)',
      'Расчётная длина +100мм (мм)',
    ];
    const lines = [header.join(';')];
    for (const r of cableJournalRows) {
      lines.push(
        [
          r.index,
          `"${r.fromLabel}"`,
          `"${r.toLabel}"`,
          `"${r.colorInfo.name}"`,
          r.section,
          r.layer === 'power' ? '"Силовой"' : '"Управление"',
          r.rawLengthMm,
          r.totalLengthMm,
        ].join(';')
      );
    }
    const totalMm = cableJournalRows.reduce((s, r) => s + r.totalLengthMm, 0);
    lines.push(`"ИТОГО";;;;;;;${totalMm}`);
    downloadFile('\uFEFF' + lines.join('\n'), 'cable-journal.csv', 'text/csv;charset=utf-8');
    showToast('Кабельный журнал выгружен в CSV');
  };

  // Live preview wire path while drawing
  const previewWirePath = useMemo(() => {
    if (mode !== 'wire' || !wireStart || !mouseWorld) return null;
    const it = doc.items.find((i) => i.id === wireStart.itemId);
    if (!it) return null;
    const p1 = getPortWorldPos(it, wireStart.portId);
    if (!p1) return null;
    const c1 = getCorridorIndex(p1.railId, p1.side);
    const yMid = CORRIDOR_BASE_Y[c1];
    const pts = simplifyOrthogonalPoints([
      { x: p1.x, y: p1.y },
      { x: p1.x, y: yMid },
      { x: mouseWorld.x, y: yMid },
      { x: mouseWorld.x, y: mouseWorld.y },
    ]);
    return pointsToSvgPath(pts);
  }, [mode, wireStart, mouseWorld, doc.items]);

  // Rail occupancy stats
  const railOccupancy = useMemo(() => {
    return [0, 1, 2].map((railId) => {
      const used = doc.items
        .filter((it) => it.railId === railId)
        .reduce((s, it) => s + (COMPONENT_MAP[it.componentId]?.widthModules ?? 1), 0);
      return { railId, used, total: SLOTS_PER_RAIL };
    });
  }, [doc.items]);

  // Build ordered cells for Plastron Marking Strip
  const plastronStrips = useMemo(() => {
    return [0, 1, 2].map((railId) => {
      const railItems = doc.items
        .filter((it) => it.railId === railId)
        .sort((a, b) => a.slotIndex - b.slotIndex);

      const cells: Array<
        | { kind: 'item'; item: PlacedItem; widthModules: number; def: ComponentDef }
        | { kind: 'empty'; startSlot: number; widthModules: number }
      > = [];

      let cursor = 0;
      for (const item of railItems) {
        const def = COMPONENT_MAP[item.componentId];
        if (!def) continue;
        if (item.slotIndex > cursor) {
          cells.push({ kind: 'empty', startSlot: cursor, widthModules: item.slotIndex - cursor });
        }
        cells.push({ kind: 'item', item, widthModules: def.widthModules, def });
        cursor = item.slotIndex + def.widthModules;
      }
      if (cursor < SLOTS_PER_RAIL) {
        cells.push({ kind: 'empty', startSlot: cursor, widthModules: SLOTS_PER_RAIL - cursor });
      }
      return { railId, cells };
    });
  }, [doc.items]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none font-sans">
      {/* Print styles for exact 1:1 mm Plastron Labels */}
      <style>{`
        @media print {
          body { background: #ffffff !important; color: #000000 !important; }
          .no-print { display: none !important; }
          .print-area {
            position: static !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 8mm !important;
            color: #000000 !important;
          }
          .plastron-strip-print {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* ==================================================================== */}
      {/* TOP TOOLBAR                                                          */}
      {/* ==================================================================== */}
      <header className="no-print h-12 shrink-0 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between gap-2 overflow-x-auto">
        {/* Left: Brand & Tabs */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
            <div className="w-7 h-7 rounded-md bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Zap className="w-4 h-4" />
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-xs font-bold tracking-wide text-slate-100">ЩитCAD 2D</div>
              <div className="text-[10px] text-slate-400">3×18M · 1M = 18мм</div>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-950/70 p-0.5 rounded-lg border border-slate-800">
            {(
              [
                { id: 'editor', label: 'Редактор', icon: LayoutGrid },
                { id: 'bom', label: 'Спецификация и смета', icon: FileSpreadsheet },
                { id: 'cables', label: 'Кабельный журнал', icon: ListTree },
                { id: 'labels', label: 'Наклейка на щит', icon: Tag },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Center: Mode Switcher + Undo/Redo + Zoom (visible in Editor) */}
        {activeTab === 'editor' && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Mode Switch */}
            <div className="flex items-center bg-slate-950/70 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => {
                  setMode('select');
                  setWireStart(null);
                }}
                title="Режим выбора и перетаскивания (V)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'select'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MousePointer2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Выбор</span>
              </button>
              <button
                onClick={() => setMode('wire')}
                title="Режим прокладки проводов (W)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'wire'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cable className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Провод</span>
              </button>
            </div>

            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5 border-l border-slate-800 pl-2">
              <button
                onClick={handleUndo}
                disabled={past.length === 0}
                title="Отменить (Ctrl+Z)"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={future.length === 0}
                title="Повторить (Ctrl+Y)"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-0.5 border-l border-slate-800 pl-2">
              <button
                onClick={() => setZoom((z) => Math.max(0.55, z / 1.2))}
                title="Уменьшить"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(1.45)}
                title="Масштаб 100%"
                className="px-1.5 py-1 rounded-md text-[11px] font-mono text-slate-300 hover:bg-slate-800 min-w-[46px] text-center"
              >
                {Math.round((zoom / 1.45) * 100)}%
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(4.8, z * 1.2))}
                title="Увеличить"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={fitToView}
                title="Вписать щит в экран"
                className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Right: AI + JSON Export / Import / Reset */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setAiOpen((v) => !v)}
            title="ИИ-инженер (Groq) для редактирования схемы"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              aiOpen
                ? 'bg-violet-600 border-violet-400 text-white shadow-sm'
                : 'bg-violet-500/15 hover:bg-violet-500/25 border-violet-500/40 text-violet-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>ИИ-инженер</span>
          </button>
          <button
            onClick={handleExportJson}
            title="Экспорт проекта в JSON"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Экспорт JSON</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Импорт проекта из JSON"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Импорт JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            onClick={handleResetDemo}
            title="Сбросить к демо-щиту"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* TAB 1: CAD EDITOR (3 PANELS)                                         */}
      {/* ==================================================================== */}
      {activeTab === 'editor' && (
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          {/* LEFT PANEL: Library + Layers */}
          <aside
            className={`no-print shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 ${
              leftOpen ? 'w-64 lg:w-72' : 'w-0 overflow-hidden border-r-0'
            }`}
          >
            {/* Component Library Header & Search */}
            <div className="p-3 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Библиотека модулей ({COMPONENT_LIBRARY.length})
                </span>
                <button
                  onClick={() => setLeftOpen(false)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400"
                  title="Свернуть панель"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск модуля, артикула..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Component List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredComponents.map((comp) => (
                <div
                  key={comp.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', comp.id);
                    e.dataTransfer.effectAllowed = 'copy';
                    setPaletteGhost({
                      componentId: comp.id,
                      railId: 0,
                      slotIndex: 0,
                      isValid: true,
                    });
                  }}
                  onDragEnd={() => setPaletteGhost(null)}
                  onClick={() => handleAddComponentClick(comp.id)}
                  className="group flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/90 border border-slate-800/80 hover:border-sky-500/50 cursor-pointer transition-all"
                >
                  {/* Mini module badge */}
                  <div
                    className="w-8 h-9 rounded border border-slate-700 shrink-0 flex flex-col items-center justify-center relative overflow-hidden"
                    style={{ backgroundColor: comp.bodyColor }}
                  >
                    <div
                      className="w-5 h-2 rounded-sm"
                      style={{ backgroundColor: comp.handleColor }}
                    />
                    <span className="text-[8px] font-bold text-slate-900 mt-0.5 font-mono bg-white/80 px-0.5 rounded">
                      {comp.widthModules}M
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-200 truncate">{comp.name}</div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>
                        {comp.brand} · {comp.widthModules * 18}мм
                      </span>
                      <span className="font-mono text-slate-300">{formatRub(comp.price)}</span>
                    </div>
                  </div>
                  <div className="w-6 h-6 rounded-md bg-slate-800 group-hover:bg-sky-600 text-slate-400 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
              {filteredComponents.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500">Модули не найдены</div>
              )}
            </div>

            {/* Layer Visibility Panel */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/90">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <Layers className="w-3.5 h-3.5" />
                <span>Слои</span>
              </div>
              <div className="space-y-1">
                {(
                  [
                    { key: 'rails', label: 'DIN-рейки и сетка', dot: '#64748b' },
                    { key: 'modules', label: 'Модули', dot: '#38bdf8' },
                    { key: 'powerWires', label: 'Силовые провода', dot: '#b45309' },
                    { key: 'controlWires', label: 'Провода управления', dot: '#f97316' },
                    { key: 'labels', label: 'Подписи потребителей', dot: '#a855f7' },
                  ] as const
                ).map((l) => {
                  const visible = layers[l.key];
                  return (
                    <button
                      key={l.key}
                      onClick={() => setLayers((prev) => ({ ...prev, [l.key]: !prev[l.key] }))}
                      className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-slate-800/80 text-xs transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: l.dot, opacity: visible ? 1 : 0.25 }}
                        />
                        <span className={visible ? 'text-slate-200' : 'text-slate-500 line-through'}>
                          {l.label}
                        </span>
                      </span>
                      {visible ? (
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Toggle Left Panel Button when collapsed */}
          {!leftOpen && (
            <button
              onClick={() => setLeftOpen(true)}
              className="no-print absolute left-2 top-2 z-20 p-1.5 rounded-md bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white shadow-lg"
              title="Открыть библиотеку"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* CENTRAL SVG CANVAS */}
          <main
            ref={containerRef}
            className="flex-1 relative bg-[#0b1120] overflow-hidden"
            onWheel={handleWheel}
            onDragOver={handlePaletteDragOver}
            onDragLeave={() => setPaletteGhost(null)}
            onDrop={handlePaletteDrop}
            onContextMenu={(e) => {
              if (wireStart) {
                e.preventDefault();
                setWireStart(null);
              }
            }}
          >
            {/* Mode / Hint Banner inside Canvas */}
            <div className="no-print absolute top-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-[11px] text-slate-300 shadow-lg backdrop-blur">
              {mode === 'wire' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {wireStart
                      ? 'Выберите вторую клемму (Esc или ПКМ — отмена)'
                      : 'Кликните по первой клемме для прокладки провода'}
                  </span>
                  <span className="border-l border-slate-700 pl-2 flex items-center gap-1">
                    <span className="text-slate-400">Сечение:</span>
                    {WIRE_SECTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setNewWireSection(s)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          newWireSection === s
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span>
                    Перетаскивайте модули по DIN-рейкам (шаг 18 мм) · Колёсико — зум · Фон — панорама
                  </span>
                </>
              )}
            </div>

            {/* Hovered port tooltip in Wire Mode */}
            {mode === 'wire' && hoveredPort && (
              <div className="no-print absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-mono">
                {(() => {
                  const it = doc.items.find((i) => i.id === hoveredPort.itemId);
                  const port = it
                    ? COMPONENT_MAP[it.componentId]?.ports.find((p) => p.id === hoveredPort.portId)
                    : null;
                  return `Клемма: ${it?.designation ?? '?'}:${port?.label ?? hoveredPort.portId} (${port?.type ?? ''})`;
                })()}
              </div>
            )}

            {/* SVG Viewport */}
            <svg
              ref={svgRef}
              className={`w-full h-full block ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
            >
              <defs>
                {/* Millimeter blueprint background grid */}
                <pattern
                  id="cad-grid-minor"
                  width={9}
                  height={9}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 9 0 L 0 0 0 9"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth={0.35}
                  />
                </pattern>
                <pattern
                  id="cad-grid-major"
                  width={18}
                  height={18}
                  patternUnits="userSpaceOnUse"
                >
                  <rect width={18} height={18} fill="url(#cad-grid-minor)" />
                  <path
                    d="M 18 0 L 0 0 0 18"
                    fill="none"
                    stroke="#334155"
                    strokeWidth={0.55}
                    opacity={0.55}
                  />
                </pattern>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Enclosure outer cabinet */}
                <rect
                  x={0}
                  y={0}
                  width={PANEL_WIDTH_MM}
                  height={PANEL_HEIGHT_MM}
                  rx={6}
                  fill="#0f172a"
                  stroke="#334155"
                  strokeWidth={1.6}
                />
                {/* Blueprint grid inside cabinet */}
                <rect
                  x={4}
                  y={4}
                  width={PANEL_WIDTH_MM - 8}
                  height={PANEL_HEIGHT_MM - 8}
                  rx={4}
                  fill="url(#cad-grid-major)"
                />

                {/* Left & Right vertical wiring ducts */}
                <rect
                  x={10}
                  y={16}
                  width={44}
                  height={PANEL_HEIGHT_MM - 32}
                  rx={2}
                  fill="#1e293b"
                  fillOpacity={0.35}
                  stroke="#334155"
                  strokeWidth={0.6}
                  strokeDasharray="3 2"
                />
                <rect
                  x={PANEL_WIDTH_MM - 54}
                  y={16}
                  width={44}
                  height={PANEL_HEIGHT_MM - 32}
                  rx={2}
                  fill="#1e293b"
                  fillOpacity={0.35}
                  stroke="#334155"
                  strokeWidth={0.6}
                  strokeDasharray="3 2"
                />

                {/* Cabinet Header Dimension */}
                <text
                  x={PANEL_WIDTH_MM / 2}
                  y={12}
                  fontSize={4.8}
                  fill="#64748b"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  ЩИТ РАСПРЕДЕЛИТЕЛЬНЫЙ · 3 DIN-РЕЙКИ × 18 МОДУЛЕЙ ({RAIL_WIDTH_MM} ММ)
                </text>

                {/* LAYER 1: DIN RAILS & SLOT GRID */}
                {layers.rails &&
                  RAIL_CENTERS_Y.map((railY, railIdx) => (
                    <g key={railIdx}>
                      {/* Rail label on left */}
                      <text
                        x={RAIL_START_X - 4}
                        y={railY + 1.5}
                        fontSize={4.5}
                        fontWeight={700}
                        fill="#94a3b8"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        R{railIdx + 1}
                      </text>

                      {/* Metal 35mm DIN rail profile */}
                      <rect
                        x={RAIL_START_X - 4}
                        y={railY - 17.5}
                        width={RAIL_WIDTH_MM + 8}
                        height={35}
                        rx={1}
                        fill="#475569"
                        stroke="#64748b"
                        strokeWidth={0.8}
                      />
                      <rect
                        x={RAIL_START_X - 4}
                        y={railY - 11.5}
                        width={RAIL_WIDTH_MM + 8}
                        height={23}
                        fill="#334155"
                      />
                      {/* Mounting slots along DIN rail */}
                      {Array.from({ length: SLOTS_PER_RAIL }).map((_, slotIdx) => {
                        const sx = RAIL_START_X + slotIdx * MODULE_MM;
                        return (
                          <g key={slotIdx}>
                            {/* Oval rail perforation */}
                            <rect
                              x={sx + 4.5}
                              y={railY - 2.2}
                              width={9}
                              height={4.4}
                              rx={2.2}
                              fill="#0f172a"
                              opacity={0.75}
                            />
                            {/* Slot boundary guide */}
                            <rect
                              x={sx}
                              y={railY - MODULE_HEIGHT_MM / 2}
                              width={MODULE_MM}
                              height={MODULE_HEIGHT_MM}
                              fill="none"
                              stroke="#334155"
                              strokeWidth={0.35}
                              strokeDasharray="2 2"
                              opacity={0.65}
                            />
                            {/* Slot number */}
                            <text
                              x={sx + MODULE_MM / 2}
                              y={railY - MODULE_HEIGHT_MM / 2 - 2.2}
                              fontSize={3.1}
                              fill="#64748b"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              {slotIdx + 1}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  ))}

                {/* LAYER 2: MODULES */}
                {layers.modules &&
                  doc.items.map((item) => (
                    <ModuleSvg
                      key={item.id}
                      item={item}
                      isSelected={selectedItemId === item.id}
                      isDragging={dragState?.itemId === item.id}
                      mode={mode}
                      showLabels={layers.labels}
                      wireStart={wireStart}
                      hoveredPort={hoveredPort}
                      onPointerDownModule={handlePointerDownModule}
                      onPortClick={handlePortClick}
                      onPortHover={setHoveredPort}
                    />
                  ))}

                {/* Drag Collision Ghost (if hovering an invalid occupied slot) */}
                {dragState && !dragState.isValid && (
                  <g pointerEvents="none">
                    {(() => {
                      const it = doc.items.find((i) => i.id === dragState.itemId);
                      const w = (it ? COMPONENT_MAP[it.componentId]?.widthModules ?? 1 : 1) * MODULE_MM;
                      const gx = RAIL_START_X + dragState.hoverSlot * MODULE_MM;
                      const gy = RAIL_CENTERS_Y[dragState.hoverRail] - MODULE_HEIGHT_MM / 2;
                      return (
                        <rect
                          x={gx}
                          y={gy}
                          width={w}
                          height={MODULE_HEIGHT_MM}
                          rx={2}
                          fill="#ef4444"
                          fillOpacity={0.28}
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                        />
                      );
                    })()}
                  </g>
                )}

                {/* Palette Drag-and-Drop Ghost */}
                {paletteGhost && (
                  <g pointerEvents="none">
                    {(() => {
                      const def = COMPONENT_MAP[paletteGhost.componentId];
                      const w = (def?.widthModules ?? 1) * MODULE_MM;
                      const gx = RAIL_START_X + paletteGhost.slotIndex * MODULE_MM;
                      const gy = RAIL_CENTERS_Y[paletteGhost.railId] - MODULE_HEIGHT_MM / 2;
                      return (
                        <rect
                          x={gx}
                          y={gy}
                          width={w}
                          height={MODULE_HEIGHT_MM}
                          rx={2}
                          fill={paletteGhost.isValid ? '#22c55e' : '#ef4444'}
                          fillOpacity={0.28}
                          stroke={paletteGhost.isValid ? '#22c55e' : '#ef4444'}
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                        />
                      );
                    })()}
                  </g>
                )}

                {/* LAYER 3 & 4: ORTHOGONAL WIRES */}
                <g>
                  {routedWires.map((rw) => {
                    if (rw.wire.layer === 'power' && !layers.powerWires) return null;
                    if (rw.wire.layer === 'control' && !layers.controlWires) return null;

                    const colorInfo = WIRE_COLORS[rw.wire.color];
                    const isSelected = selectedWireId === rw.wire.id;
                    const strokeWidth =
                      rw.wire.section >= 6
                        ? 2.2
                        : rw.wire.section >= 4
                        ? 1.85
                        : rw.wire.section >= 2.5
                        ? 1.5
                        : 1.2;

                    return (
                      <g
                        key={rw.wire.id}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWireId(rw.wire.id);
                          setSelectedItemId(null);
                        }}
                      >
                        {/* Wide invisible hit path for easy clicking */}
                        <path
                          d={rw.pathD}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={7}
                        />
                        {/* Selection glow */}
                        {isSelected && (
                          <path
                            d={rw.pathD}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth={strokeWidth + 3.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={0.55}
                          />
                        )}
                        {/* Dark outline for contrast against dark & light surfaces */}
                        <path
                          d={rw.pathD}
                          fill="none"
                          stroke="#020617"
                          strokeWidth={strokeWidth + 0.9}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.7}
                        />
                        {/* Main conductor stroke */}
                        <path
                          d={rw.pathD}
                          fill="none"
                          stroke={colorInfo.hex}
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* PE green stripe overlay */}
                        {colorInfo.stripeHex && (
                          <path
                            d={rw.pathD}
                            fill="none"
                            stroke={colorInfo.stripeHex}
                            strokeWidth={strokeWidth}
                            strokeDasharray="4.5 4.5"
                            strokeLinecap="butt"
                            strokeLinejoin="round"
                          />
                        )}
                        {/* Endpoint ferrules */}
                        {rw.points.length >= 2 && (
                          <>
                            <circle
                              cx={rw.points[0].x}
                              cy={rw.points[0].y}
                              r={1.7}
                              fill={colorInfo.hex}
                              stroke="#0f172a"
                              strokeWidth={0.5}
                            />
                            <circle
                              cx={rw.points[rw.points.length - 1].x}
                              cy={rw.points[rw.points.length - 1].y}
                              r={1.7}
                              fill={colorInfo.hex}
                              stroke="#0f172a"
                              strokeWidth={0.5}
                            />
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Live Wire Drawing Preview */}
                {previewWirePath && (
                  <path
                    d={previewWirePath}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth={1.6}
                    strokeDasharray="4 3"
                    pointerEvents="none"
                  />
                )}
              </g>
            </svg>
          </main>

          {/* Toggle Right Panel Button when collapsed */}
          {!rightOpen && (
            <button
              onClick={() => setRightOpen(true)}
              className="no-print absolute right-2 top-2 z-20 p-1.5 rounded-md bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white shadow-lg"
              title="Открыть инспектор"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}

          {/* RIGHT PANEL: INSPECTOR */}
          <aside
            className={`no-print shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col transition-all duration-200 ${
              rightOpen ? 'w-72 lg:w-80' : 'w-0 overflow-hidden border-l-0'
            }`}
          >
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Инспектор свойств
              </span>
              <button
                onClick={() => setRightOpen(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400"
                title="Свернуть инспектор"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* MODULE INSPECTOR */}
              {selectedItem && COMPONENT_MAP[selectedItem.componentId] && (
                <>
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-sky-400">
                          {COMPONENT_MAP[selectedItem.componentId].name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {COMPONENT_MAP[selectedItem.componentId].brand} ·{' '}
                          {COMPONENT_MAP[selectedItem.componentId].widthModules} мод. (
                          {COMPONENT_MAP[selectedItem.componentId].widthModules * 18} мм)
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-slate-200">
                        R{selectedItem.railId + 1} · #{selectedItem.slotIndex + 1}
                      </span>
                    </div>

                    {/* Quick slot nudge */}
                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400 mr-auto">Сдвиг по рейке:</span>
                      <button
                        onClick={() => nudgeSelectedItem(-1)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                      >
                        ← 18мм
                      </button>
                      <button
                        onClick={() => nudgeSelectedItem(1)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                      >
                        18мм →
                      </button>
                    </div>
                  </div>

                  {/* Editable Fields */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Позиционное обозначение (designation)
                      </label>
                      <input
                        type="text"
                        value={selectedItem.designation}
                        onChange={(e) => updateSelectedItem({ designation: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Номинал (rating)
                      </label>
                      <input
                        type="text"
                        value={selectedItem.rating}
                        onChange={(e) => updateSelectedItem({ rating: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Подпись потребителя (label)
                      </label>
                      <input
                        type="text"
                        value={selectedItem.label}
                        onChange={(e) => updateSelectedItem({ label: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Артикул (article)
                      </label>
                      <input
                        type="text"
                        value={selectedItem.article}
                        onChange={(e) => updateSelectedItem({ article: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Цена, ₽</label>
                        <input
                          type="number"
                          min={0}
                          value={selectedItem.price}
                          onChange={(e) =>
                            updateSelectedItem({ price: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Монтаж, ₽</label>
                        <input
                          type="number"
                          min={0}
                          value={selectedItem.laborCost}
                          onChange={(e) =>
                            updateSelectedItem({
                              laborCost: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Connected Wires */}
                  <div>
                    <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                      Подключенные провода
                    </div>
                    <div className="space-y-1">
                      {cableJournalRows
                        .filter((r) => {
                          const w = doc.wires.find((x) => x.id === r.id);
                          return (
                            w &&
                            (w.from.itemId === selectedItem.id || w.to.itemId === selectedItem.id)
                          );
                        })
                        .map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              setSelectedWireId(r.id);
                              setSelectedItemId(null);
                            }}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-slate-950/70 hover:bg-slate-800 border border-slate-800 text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 font-mono text-slate-200">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: r.colorInfo.hex }}
                              />
                              {r.fromLabel} → {r.toLabel}
                            </span>
                            <span className="text-slate-400 font-mono">{r.section}мм²</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const id = selectedItem.id;
                      commitDoc((prev) => ({
                        ...prev,
                        items: prev.items.filter((i) => i.id !== id),
                        wires: prev.wires.filter(
                          (w) => w.from.itemId !== id && w.to.itemId !== id
                        ),
                      }));
                      setSelectedItemId(null);
                      showToast(`Модуль ${selectedItem.designation} удалён`);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-medium transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить модуль</span>
                  </button>
                </>
              )}

              {/* WIRE INSPECTOR */}
              {selectedRoutedWire && (
                <>
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                    <div className="text-xs font-semibold text-amber-400 mb-1">
                      Соединение (Провод)
                    </div>
                    <div className="text-xs font-mono text-slate-100">
                      {(() => {
                        const row = cableJournalRows.find(
                          (r) => r.id === selectedRoutedWire.wire.id
                        );
                        return row ? `${row.fromLabel} → ${row.toLabel}` : 'Провод';
                      })()}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800">
                      <span>Длина трассы: {selectedRoutedWire.rawLengthMm} мм</span>
                      <span className="text-sky-400 font-mono">
                        +100мм = {selectedRoutedWire.totalLengthMm} мм
                      </span>
                    </div>
                  </div>

                  {/* Color Picker */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">
                      Цвет и назначение жилы
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(Object.keys(WIRE_COLORS) as WireColorKey[]).map((ck) => {
                        const info = WIRE_COLORS[ck];
                        const active = selectedRoutedWire.wire.color === ck;
                        return (
                          <button
                            key={ck}
                            onClick={() => updateSelectedWire({ color: ck })}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                              active
                                ? 'bg-slate-800 border-sky-500 text-white'
                                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="w-4 h-3 rounded-sm border border-slate-600 inline-block"
                                style={{
                                  background: info.stripeHex
                                    ? `repeating-linear-gradient(45deg, ${info.hex}, ${info.hex} 3px, ${info.stripeHex} 3px, ${info.stripeHex} 6px)`
                                    : info.hex,
                                }}
                              />
                              <span>{info.name}</span>
                            </span>
                            {active && <Check className="w-3.5 h-3.5 text-sky-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cross Section */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">
                      Сечение провода, мм²
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {WIRE_SECTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => updateSelectedWire({ section: s })}
                          className={`py-1.5 rounded-md border text-xs font-mono transition-colors ${
                            selectedRoutedWire.wire.section === s
                              ? 'bg-sky-600 border-sky-400 text-white font-semibold'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Layer */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">Слой проводки</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'power', label: 'Силовой' },
                          { id: 'control', label: 'Управление' },
                        ] as const
                      ).map((l) => (
                        <button
                          key={l.id}
                          onClick={() => updateSelectedWire({ layer: l.id })}
                          className={`py-1.5 rounded-md border text-xs transition-colors ${
                            selectedRoutedWire.wire.layer === l.id
                              ? 'bg-sky-600 border-sky-400 text-white font-medium'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const id = selectedRoutedWire.wire.id;
                      commitDoc((prev) => ({
                        ...prev,
                        wires: prev.wires.filter((w) => w.id !== id),
                      }));
                      setSelectedWireId(null);
                      showToast('Провод удалён');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-medium transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить провод</span>
                  </button>
                </>
              )}

              {/* EMPTY SELECTION: PANEL OVERVIEW */}
              {!selectedItem && !selectedRoutedWire && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-200">Сводка по щиту</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Модулей</div>
                        <div className="text-sm font-bold font-mono text-sky-400">
                          {doc.items.length} шт.
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400">Проводов</div>
                        <div className="text-sm font-bold font-mono text-amber-400">
                          {doc.wires.length} шт.
                        </div>
                      </div>
                    </div>

                    {/* Rail fill bars */}
                    <div className="space-y-1.5 pt-1">
                      {railOccupancy.map((r) => (
                        <div key={r.railId}>
                          <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                            <span>DIN-рейка {r.railId + 1}</span>
                            <span className="font-mono">
                              {r.used} / {r.total}M
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-sky-500 rounded-full transition-all"
                              style={{ width: `${(r.used / r.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                      <span className="text-slate-400">Смета итого:</span>
                      <span className="font-bold font-mono text-emerald-400">
                        {formatRub(bomData.grandTotal)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
                    <div className="font-semibold text-slate-300">Горячие клавиши</div>
                    <div className="flex justify-between">
                      <span>Выбор / Перетаскивание</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">V</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Прокладка провода</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">W</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Отменить / Повторить</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                        Ctrl+Z / Y
                      </kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Удалить выбранное</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                        Del
                      </kbd>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: SPECIFICATION & ESTIMATE (BOM)                                */}
      {/* ==================================================================== */}
      {activeTab === 'bom' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950">
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-100">Спецификация и смета сборки</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Автоматическая группировка модулей, расчёт оборудования и стоимости электромонтажных работ
                </p>
              </div>
              <button
                onClick={handleExportBomCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать CSV</span>
              </button>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">Оборудование</div>
                <div className="text-lg font-bold font-mono text-slate-100 mt-1">
                  {formatRub(bomData.equipmentTotal)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{doc.items.length} модулей</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">Монтаж модулей</div>
                <div className="text-lg font-bold font-mono text-sky-400 mt-1">
                  {formatRub(bomData.moduleLaborTotal)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">установка на DIN-рейку</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">Расключение проводов</div>
                <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                  {formatRub(bomData.wireLaborTotal)}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                  <span>{bomData.wireEndsCount} концов ×</span>
                  <input
                    type="number"
                    min={0}
                    value={doc.terminationCostPerEnd}
                    onChange={(e) =>
                      commitDoc((prev) => ({
                        ...prev,
                        terminationCostPerEnd: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-14 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[11px] font-mono text-slate-200"
                  />
                  <span>₽</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50">
                <div className="text-[11px] text-emerald-300">Итого по смете</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  {formatRub(bomData.grandTotal)}
                </div>
                <div className="text-[11px] text-emerald-300/70 mt-0.5">
                  работы: {formatRub(bomData.totalLabor)}
                </div>
              </div>
            </div>

            {/* BOM Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-3 font-medium">Наименование</th>
                    <th className="py-2.5 px-3 font-medium">Артикул</th>
                    <th className="py-2.5 px-3 font-medium">Позиции</th>
                    <th className="py-2.5 px-3 font-medium text-right">Кол-во</th>
                    <th className="py-2.5 px-3 font-medium text-right">Цена ед.</th>
                    <th className="py-2.5 px-3 font-medium text-right">Сумма оборуд.</th>
                    <th className="py-2.5 px-3 font-medium text-right">Монтаж</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {bomData.rows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-medium text-slate-100">
                        {row.name}{' '}
                        <span className="text-slate-500 font-normal">({row.brand})</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{row.article}</td>
                      <td className="py-2.5 px-3 font-mono text-sky-400">
                        {row.designations.join(', ')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">{row.qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                        {formatRub(row.unitPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-100">
                        {formatRub(row.qty * row.unitPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                        {formatRub(row.qty * row.unitLabor)}
                      </td>
                    </tr>
                  ))}
                  {/* Wire termination row */}
                  <tr className="bg-slate-950/40">
                    <td className="py-2.5 px-3 font-medium text-amber-300" colSpan={3}>
                      Расключение концов проводов (обжим НШВИ, протяжка клемм)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                      {bomData.wireEndsCount} шт.
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">—</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-300">
                      {formatRub(bomData.wireLaborTotal)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-950/80 font-bold">
                    <td className="py-3 px-3 text-slate-200" colSpan={5}>
                      ИТОГО ПО СПЕЦИФИКАЦИИ
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-100">
                      {formatRub(bomData.equipmentTotal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-400">
                      {formatRub(bomData.totalLabor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: CABLE JOURNAL                                                 */}
      {/* ==================================================================== */}
      {activeTab === 'cables' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950">
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-100">Кабельный журнал щита</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Трассы ортогональных соединений с расчётом длины по сегментам (+100 мм запас на разделку)
                </p>
              </div>
              <button
                onClick={handleExportCablesCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Экспорт CSV</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-3 font-medium w-10">№</th>
                    <th className="py-2.5 px-3 font-medium">Соединение (Откуда → Куда)</th>
                    <th className="py-2.5 px-3 font-medium">Цвет жилы</th>
                    <th className="py-2.5 px-3 font-medium text-right">Сечение</th>
                    <th className="py-2.5 px-3 font-medium">Слой</th>
                    <th className="py-2.5 px-3 font-medium text-right">Трасса, мм</th>
                    <th className="py-2.5 px-3 font-medium text-right">Итого (+100 мм)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {cableJournalRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500">{row.index}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-100">
                        {row.fromLabel} <span className="text-sky-400">→</span> {row.toLabel}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-4 h-2.5 rounded-sm border border-slate-600"
                            style={{
                              background: row.colorInfo.stripeHex
                                ? `repeating-linear-gradient(45deg, ${row.colorInfo.hex}, ${row.colorInfo.hex} 3px, ${row.colorInfo.stripeHex} 3px, ${row.colorInfo.stripeHex} 6px)`
                                : row.colorInfo.hex,
                            }}
                          />
                          <span className="text-slate-200">{row.colorInfo.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                        {row.section} мм²
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            row.layer === 'power'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {row.layer === 'power' ? 'Силовой' : 'Управление'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {row.rawLengthMm} мм
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                        {row.totalLengthMm} мм
                      </td>
                    </tr>
                  ))}
                  {cableJournalRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Нет проложенных проводов. Переключитесь в режим «Провод» в редакторе.
                      </td>
                    </tr>
                  )}
                </tbody>
                {cableJournalRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-950/80 font-bold">
                      <td className="py-3 px-3 text-slate-200" colSpan={5}>
                        ИТОГО ({cableJournalRows.length} проводников)
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        {cableJournalRows.reduce((s, r) => s + r.rawLengthMm, 0)} мм
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-400">
                        {(
                          cableJournalRows.reduce((s, r) => s + r.totalLengthMm, 0) / 1000
                        ).toFixed(2)}{' '}
                        м
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: PLASTRON MARKING LABELS (EXACT 18MM/MODULE SCALE + PRINT)     */}
      {/* ==================================================================== */}
      {activeTab === 'labels' && (
        <div className="print-area flex-1 overflow-auto p-4 md:p-6 bg-slate-950">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-100">Наклейка на пластрон (маркировка)</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Точный масштаб 1:1 при печати (1 модуль = 18 мм, ширина ленты 18M = 324 мм)
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Печать (1:1 мм)</span>
              </button>
            </div>

            <div className="space-y-6 overflow-x-auto pb-4">
              {plastronStrips.map((strip) => (
                <div
                  key={strip.railId}
                  className="plastron-strip-print bg-white text-slate-900 p-4 rounded-xl shadow-lg inline-block min-w-max border border-slate-300"
                >
                  <div className="flex items-center justify-between mb-2 text-xs font-bold text-slate-700">
                    <span>DIN-РЕЙКА №{strip.railId + 1}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      18 модулей × 18 мм = 324 мм
                    </span>
                  </div>

                  {/* Exact millimeter strip */}
                  <div
                    className="flex border-2 border-slate-900 bg-white"
                    style={{ width: `${SLOTS_PER_RAIL * 18}mm` }}
                  >
                    {strip.cells.map((cell, idx) => {
                      if (cell.kind === 'empty') {
                        return (
                          <div
                            key={`empty-${idx}`}
                            style={{ width: `${cell.widthModules * 18}mm` }}
                            className="h-16 border-r border-dashed border-slate-300 last:border-r-0 flex items-center justify-center bg-slate-50 text-[9px] text-slate-400 font-mono"
                          >
                            {cell.widthModules >= 2 ? `Резерв (${cell.widthModules}M)` : ''}
                          </div>
                        );
                      }

                      const { item, widthModules, def } = cell;
                      return (
                        <div
                          key={item.id}
                          style={{ width: `${widthModules * 18}mm` }}
                          className="h-16 border-r border-slate-900 last:border-r-0 flex flex-col justify-between overflow-hidden"
                        >
                          {/* Category color bar */}
                          <div
                            className="h-2.5 w-full flex items-center justify-center"
                            style={{ backgroundColor: def.accentColor }}
                          />
                          <div className="px-0.5 text-center leading-tight flex-1 flex flex-col justify-center">
                            <div className="text-[11px] font-extrabold font-mono text-slate-950 truncate">
                              {item.designation}
                            </div>
                            <div className="text-[9px] font-semibold font-mono text-slate-600 truncate">
                              {item.rating}
                            </div>
                            <div
                              className="text-[8.5px] text-slate-800 leading-tight mt-0.5 line-clamp-2 break-words px-0.5"
                              title={item.label}
                            >
                              {item.label}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Ruler ticks under strip */}
                  <div
                    className="flex mt-1"
                    style={{ width: `${SLOTS_PER_RAIL * 18}mm` }}
                  >
                    {Array.from({ length: SLOTS_PER_RAIL }).map((_, s) => (
                      <div
                        key={s}
                        style={{ width: '18mm' }}
                        className="text-center text-[8px] font-mono text-slate-400 border-l border-slate-300 last:border-r"
                      >
                        {s + 1}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI ENGINEER DRAWER (GROQ) */}
      {aiOpen && (
        <div className="no-print fixed bottom-4 right-4 z-40 w-[340px] sm:w-[390px] max-w-[calc(100vw-2rem)] h-[470px] max-h-[calc(100vh-5rem)] bg-slate-900 border border-violet-500/40 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">ИИ-инженер · Groq</div>
                <div className="text-[10px] text-slate-400">
                  {groqKey.trim() ? 'Режим: ваш API-ключ Groq' : 'Режим: сервер Vercel (/api/ai)'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAiSettingsOpen((v) => !v)}
                title="Настройки API-ключа Groq"
                className={`p-1.5 rounded-md transition-colors ${
                  aiSettingsOpen
                    ? 'bg-slate-800 text-violet-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setAiOpen(false)}
                title="Закрыть"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {aiSettingsOpen && (
            <div className="p-3 bg-slate-950 border-b border-slate-800 space-y-1.5 text-[11px]">
              <div className="text-slate-300 font-medium">API-ключ Groq (опционально)</div>
              <input
                type="password"
                value={groqKey}
                onChange={(e) => handleSaveGroqKey(e.target.value)}
                placeholder="gsk_... (оставьте пустым на Vercel)"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-violet-500"
              />
              <div className="text-[10px] text-slate-500">
                На Vercel задайте GROQ_API_KEY в Environment Variables — тогда пользователям ключ вводить не нужно.
              </div>
            </div>
          )}

          {/* Quick Prompts */}
          <div className="px-3 py-2 border-b border-slate-800/80 flex gap-1.5 overflow-x-auto bg-slate-900/60">
            {[
              'Добавь дифавтомат 16А на ванную и подключи к KV1',
              'Добавь автомат C16 на балкон и подключи к FD1',
              'Удали контактор KM1',
            ].map((q) => (
              <button
                key={q}
                onClick={() => handleSendAiPrompt(q)}
                disabled={aiLoading}
                className="shrink-0 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700/80 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
            {aiMessages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] px-3 py-2 rounded-lg leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-violet-600 text-white'
                      : m.isError
                      ? 'bg-red-950/80 border border-red-700/70 text-red-200'
                      : 'bg-slate-800 text-slate-100 border border-slate-700/80'
                  }`}
                >
                  <div>{m.text}</div>
                  {typeof m.appliedCount === 'number' && m.appliedCount > 0 && (
                    <div className="mt-1.5 pt-1 border-t border-slate-700/80 text-[10px] text-emerald-400 font-mono">
                      ✓ Применено изменений: {m.appliedCount} (Ctrl+Z — отменить)
                    </div>
                  )}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span>Groq проектирует изменения...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendAiPrompt();
                }
              }}
              placeholder="Напр.: добавь автомат C16 на духовку..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={() => handleSendAiPrompt()}
              disabled={aiLoading || !aiInput.trim()}
              className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors"
              title="Отправить"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`no-print fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg border shadow-xl text-xs font-medium ${
            toast.type === 'err'
              ? 'bg-red-950/95 border-red-700 text-red-200'
              : 'bg-slate-900/95 border-sky-500/60 text-slate-100'
          }`}
        >
          {toast.type === 'err' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}