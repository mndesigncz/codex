import DemoRoot from '@/components/demo/DemoRoot';

// Veřejná trasa bez přihlášení: middleware ji nehlídá (matcher zná jen
// /api, /employer, /employee, /kiosk a /client) a skutečné API ukázka
// nevolá, odpovídá jí mock server v prohlížeči (lib/demo).
export default function DemoPage() {
  return <DemoRoot />;
}
