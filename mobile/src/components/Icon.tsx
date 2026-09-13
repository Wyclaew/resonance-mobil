import type { ComponentType } from "react";

// ⚠️ İkonlar TEK TEK yoldan içe aktarılır: paketin ana girişi 3600+ ikonun
// hepsini dışa aktarıyor ve Metro ağaç sallamadığı için hepsi pakete girerdi.
// Masaüstü de lucide kullanıyor → iki uygulamanın ikon dili aynı.
import ArchiveRestore from "lucide-react-native/icons/archive-restore";
import ArrowBigDown from "lucide-react-native/icons/arrow-big-down";
import ArrowBigUp from "lucide-react-native/icons/arrow-big-up";
import ArrowDownUp from "lucide-react-native/icons/arrow-down-up";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import AudioLines from "lucide-react-native/icons/audio-lines";
import Ban from "lucide-react-native/icons/ban";
import Bug from "lucide-react-native/icons/bug";
import Calendar from "lucide-react-native/icons/calendar";
import ChartColumn from "lucide-react-native/icons/chart-column";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import CircleCheck from "lucide-react-native/icons/circle-check";
import Clock from "lucide-react-native/icons/clock";
import Cloud from "lucide-react-native/icons/cloud";
import CloudOff from "lucide-react-native/icons/cloud-off";
import Compass from "lucide-react-native/icons/compass";
import Copy from "lucide-react-native/icons/copy";
import Database from "lucide-react-native/icons/database";
import Download from "lucide-react-native/icons/download";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import FileDown from "lucide-react-native/icons/file-down";
import FileUp from "lucide-react-native/icons/file-up";
import FolderOpen from "lucide-react-native/icons/folder-open";
import Gauge from "lucide-react-native/icons/gauge";
import GripVertical from "lucide-react-native/icons/grip-vertical";
import HardDrive from "lucide-react-native/icons/hard-drive";
import Headphones from "lucide-react-native/icons/headphones";
import Heart from "lucide-react-native/icons/heart";
import House from "lucide-react-native/icons/house";
import Info from "lucide-react-native/icons/info";
import Languages from "lucide-react-native/icons/languages";
import LibraryBig from "lucide-react-native/icons/library-big";
import ListMusic from "lucide-react-native/icons/list-music";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import ListPlus from "lucide-react-native/icons/list-plus";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import Maximize2 from "lucide-react-native/icons/maximize-2";
import MicVocal from "lucide-react-native/icons/mic-vocal";
import Minus from "lucide-react-native/icons/minus";
import MonitorSmartphone from "lucide-react-native/icons/monitor-smartphone";
import Moon from "lucide-react-native/icons/moon";
import Music from "lucide-react-native/icons/music";
import Palette from "lucide-react-native/icons/palette";
import Pause from "lucide-react-native/icons/pause";
import Pencil from "lucide-react-native/icons/pencil";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import Radio from "lucide-react-native/icons/radio";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Repeat from "lucide-react-native/icons/repeat";
import Repeat1 from "lucide-react-native/icons/repeat-1";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import RotateCcwClock from "lucide-react-native/icons/rotate-ccw-clock";
import Save from "lucide-react-native/icons/save";
import Search from "lucide-react-native/icons/search";
import Settings from "lucide-react-native/icons/settings";
import Share2 from "lucide-react-native/icons/share-2";
import Shuffle from "lucide-react-native/icons/shuffle";
import SkipBack from "lucide-react-native/icons/skip-back";
import SkipForward from "lucide-react-native/icons/skip-forward";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Smartphone from "lucide-react-native/icons/smartphone";
import Sparkles from "lucide-react-native/icons/sparkles";
import Sun from "lucide-react-native/icons/sun";
import Timer from "lucide-react-native/icons/timer";
import Trash from "lucide-react-native/icons/trash";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Upload from "lucide-react-native/icons/upload";
import User from "lucide-react-native/icons/user";
import WandSparkles from "lucide-react-native/icons/wand-sparkles";
import WifiOff from "lucide-react-native/icons/wifi-off";
import X from "lucide-react-native/icons/x";
import Zap from "lucide-react-native/icons/zap";

import { useColors } from "../theme";

type LucideProps = { size?: number; color?: string; strokeWidth?: number; fill?: string };

const ICONS = {
  archiveRestore: ArchiveRestore,
  arrowDownUp: ArrowDownUp,
  back: ArrowLeft,
  ban: Ban,
  bars: AudioLines,
  bug: Bug,
  calendar: Calendar,
  chart: ChartColumn,
  check: Check,
  checkCircle: CircleCheck,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  clock: Clock,
  cloud: Cloud,
  cloudOff: CloudOff,
  compass: Compass,
  copy: Copy,
  database: Database,
  devices: MonitorSmartphone,
  down: ArrowBigDown,
  download: Download,
  fileDown: FileDown,
  fileUp: FileUp,
  folder: FolderOpen,
  gauge: Gauge,
  grip: GripVertical,
  hardDrive: HardDrive,
  headphones: Headphones,
  heart: Heart,
  history: RotateCcwClock,
  home: House,
  info: Info,
  languages: Languages,
  library: LibraryBig,
  listMusic: ListMusic,
  listOrdered: ListOrdered,
  listPlus: ListPlus,
  lock: Lock,
  lockOpen: LockOpen,
  lyrics: MicVocal,
  maximize: Maximize2,
  minus: Minus,
  moon: Moon,
  more: EllipsisVertical,
  music: Music,
  palette: Palette,
  pause: Pause,
  pencil: Pencil,
  phone: Smartphone,
  play: Play,
  plus: Plus,
  radio: Radio,
  refresh: RefreshCw,
  repeat: Repeat,
  repeatOne: Repeat1,
  save: Save,
  search: Search,
  settings: Settings,
  share: Share2,
  shuffle: Shuffle,
  skipBack: SkipBack,
  skipForward: SkipForward,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  sun: Sun,
  timer: Timer,
  trash: Trash,
  undo: RotateCcw,
  up: ArrowBigUp,
  upload: Upload,
  user: User,
  wand: WandSparkles,
  warning: TriangleAlert,
  wifiOff: WifiOff,
  x: X,
  zap: Zap,
} satisfies Record<string, ComponentType<LucideProps>>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 1.8,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Oynat/duraklat gibi dolu glifler. */
  filled?: boolean;
}) {
  const c = useColors();
  const Glyph = ICONS[name] as ComponentType<LucideProps>;
  const tint = color ?? c.text;
  return <Glyph size={size} color={tint} strokeWidth={strokeWidth} fill={filled ? tint : "none"} />;
}
