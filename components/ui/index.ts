// Společné stavební kameny rozhraní (Managero 2). Obrazovky si je berou
// odsud a ne každá svoje — proto vypadá „Uložit" ve Skladu stejně jako
// v Rozvrhu, a řádek seznamu stejně u směn, rezervací i kuponů.
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Menu, MenuPanel, MenuItemButton, type MenuItem } from './Menu';
export { PageHeader } from './PageHeader';
export { Segmented, type SegmentedOption } from './Segmented';
export { EmptyState } from './EmptyState';
export { Skeleton, PageSkeleton } from './Skeleton';
export { Avatar } from './Avatar';
export { Card, Well } from './Card';
export { Field, Label, Input, Select, Textarea } from './Field';
export { Chip, type ChipTone } from './Chip';
export { ListRow } from './ListRow';
export { Stat, StatRow } from './Stat';
export { Section } from './Section';
export { Toast } from './Toast';
export { SearchField } from './SearchField';
export { ErrorState } from './ErrorState';
export { ErrorBoundary } from './ErrorBoundary';
export { useLoad } from './useLoad';
export { Modal } from './Modal';
export { DiscardGuard } from './DiscardGuard';
export { DraftNote } from './DraftNote';
export { BulkBar, SelectBox, ApproveAllBar, type BulkAction } from './BulkBar';
export { PlovouciLista } from './PlovouciLista';
export { useSelection, runBulk, type Id } from './useSelection';
export { Hint, hintsEnabled, setHintsEnabled, resetHints, dismissedCount, type HintTone } from './Hint';
// Kolo 68: kusy, které si obrazovky psaly samy (DP §3.20) — ať desátá kopie nevznikne.
export { Switch, SwitchRow } from './Switch';
export { Badge } from './Badge';
export { PersonChip } from './PersonChip';
export { Checklist, type ChecklistItem } from './Checklist';
export { MonthNav, posunMesic, nazevMesice } from './MonthNav';
export { BarSpark, type BarSparkPoint } from './BarSpark';
