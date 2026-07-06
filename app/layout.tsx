import type { Metadata } from 'next'
import './globals.css'
import SideNav from '@/components/layout/SideNav'

export const metadata: Metadata = {
  title: '하자관리 — 대전충청검사센터',
  description: '대전충청검사센터 시설 하자관리 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
          crossOrigin="anonymous"
        />
        <style>{`
          :root {
            --sb-w: 216px;
            --sb-bg: #0d1f35;
            --sb-hover: rgba(255,255,255,.06);
            --sb-active: rgba(255,255,255,.1);
            --sb-text: rgba(255,255,255,.6);
            --sb-text-on: #fff;
            --bg: #F5F6F8;
            --surface: #FFFFFF;
            --border: #E5E7EB;
            --border-sub: #F3F4F6;
            --shadow-xs: 0 1px 3px rgba(10,37,64,.06);
            --shadow-sm: 0 2px 8px rgba(10,37,64,.09);
            --shadow-md: 0 8px 28px rgba(10,37,64,.13);
            --accent: #2563EB;
            --accent-dk: #1D4ED8;
            --accent-bg: rgba(37,99,235,.08);
            --t1: #111827;
            --t2: #374151;
            --t3: #6B7280;
            --t4: #9CA3AF;
            --open: #1D4ED8;
            --open-bg: #EFF6FF;
            --prog: #F97316;
            --prog-bg: #FFF7ED;
            --hold: #EAB308;
            --hold-bg: #FEFCE8;
            --done: #16A34A;
            --done-bg: #F0FDF4;
            --crit: #B91C1C;
            --crit-bg: #FEF2F2;
            --high: #DC2626;
            --high-bg: #FEF2F2;
            --med: #CA8A04;
            --med-bg: #FEFCE8;
            --low: #6B7280;
            --low-bg: #F9FAFB;
            --r: 8px;
            --r-lg: 12px;
          }
        `}</style>
      </head>
      <body style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#F5F6F8', color: '#0a2540', fontSize: 14, lineHeight: 1.5 }}>
        <SideNav />
        <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
