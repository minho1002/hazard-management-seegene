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
            --bg: #f5f7fa;
            --surface: #fff;
            --border: #e3e8ef;
            --border-sub: #f0f4f8;
            --shadow-xs: 0 1px 3px rgba(10,37,64,.06);
            --shadow-sm: 0 2px 8px rgba(10,37,64,.09);
            --shadow-md: 0 8px 28px rgba(10,37,64,.13);
            --accent: #635bff;
            --accent-dk: #4f46e5;
            --accent-bg: rgba(99,91,255,.09);
            --t1: #0a2540;
            --t2: #425466;
            --t3: #697386;
            --t4: #b0bac6;
            --open: #1d6dc2;
            --open-bg: #ebf3fe;
            --prog: #b06b1a;
            --prog-bg: #fef3e2;
            --done: #0f7850;
            --done-bg: #e6f6f0;
            --crit: #be1044;
            --crit-bg: #fef0f4;
            --high: #c2440c;
            --high-bg: #fef3ee;
            --med: #9a6c00;
            --med-bg: #fefae8;
            --low: #697386;
            --low-bg: #f3f5f7;
            --r: 8px;
            --r-lg: 12px;
          }
        `}</style>
      </head>
      <body style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#f5f7fa', color: '#0a2540', fontSize: 14, lineHeight: 1.5 }}>
        <SideNav />
        <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
