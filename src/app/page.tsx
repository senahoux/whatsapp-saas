import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp SaaS — Sistema de Automação",
  description: "Sistema de automação de atendimento via WhatsApp para clínicas médicas",
};

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "#f1f5f9",
        gap: "1.5rem",
      }}
    >
      <div style={{ fontSize: "3rem" }}>🤖</div>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
        WhatsApp SaaS
      </h1>
      <p style={{ color: "#94a3b8", margin: 0 }}>
        Sistema de automação de atendimento |{" "}
        <strong style={{ color: "#38bdf8" }}>PASSO 1 ✅</strong>
      </p>
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "0.75rem",
          padding: "1.5rem 2rem",
          maxWidth: 480,
          textAlign: "left",
        }}
      >
        <p style={{ margin: "0 0 0.75rem", fontWeight: 600, color: "#38bdf8" }}>
          Status do Setup
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#cbd5e1", lineHeight: "2" }}>
          <li>✅ Next.js App Router + TypeScript</li>
          <li>✅ Prisma Schema (10 entidades multi-tenant)</li>
          <li>✅ SQLite configurado</li>
          <li>✅ PrismaClient singleton</li>
          <li>✅ Seed com clínica demo</li>
          <li>⏳ Painel Admin (Passo 6)</li>
          <li>⏳ Robô WhatsApp (Passo 7)</li>
        </ul>
      </div>
      <p style={{ color: "#475569", fontSize: "0.875rem" }}>
        Painel Admin será implementado no Passo 6
      </p>
    </main>
  );
}
