import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function PublicLayout({ children }: Props) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#0a0a0a", color: "#ffffff" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "#1f2937" }}
      >
        <a href="https://agenciac8.com.br" target="_blank" rel="noreferrer">
          <img
            src="https://agenciac8.com.br/Logo.webp"
            alt="Agência C8"
            className="h-8 w-auto"
          />
        </a>
        <a
          href="https://agenciac8.com.br"
          target="_blank"
          rel="noreferrer"
          className="text-sm"
          style={{ color: "#6b7280" }}
        >
          agenciac8.com.br
        </a>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center"
        style={{ borderColor: "#1f2937", color: "#6b7280" }}
      >
        <img
          src="https://agenciac8.com.br/Logo.webp"
          alt="Agência C8"
          className="h-6 w-auto mx-auto mb-4 opacity-60"
        />
        <div className="flex items-center justify-center gap-4 text-sm mb-2">
          <a
            href="https://wa.me/5533998737962"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            WhatsApp: (33) 99873-7962
          </a>
          <span>·</span>
          <a
            href="mailto:contato@agenciac8.com.br"
            className="hover:text-white transition-colors"
          >
            contato@agenciac8.com.br
          </a>
        </div>
        <p className="text-xs">© {new Date().getFullYear()} Agência C8. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
