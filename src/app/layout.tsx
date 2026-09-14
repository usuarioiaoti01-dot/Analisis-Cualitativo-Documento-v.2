import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocuCalidad | Evaluación documental',
  description:
    'Análisis Cualitativo Documental — Dirección de Políticas del SERFOR. Evalúe calidad, estructura, base legal y consistencia con el repositorio institucional.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
