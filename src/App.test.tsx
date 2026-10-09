import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./App";

function renderProtectedRoute(slug: string, initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/dashboard/:slug/login" element={<div>Login Page</div>} />
        <Route path="/dashboard/:slug" element={<ProtectedRoute />}>
          <Route index element={<div>Protected Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("ProtectedRoute", () => {
  describe("Req 12.3 — nenhuma rota acessível sem autenticação válida", () => {
    it("redireciona para login quando não há sessão no localStorage", () => {
      renderProtectedRoute("meu-cliente", "/dashboard/meu-cliente");
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });

    it("renderiza conteúdo protegido quando sessão válida existe", () => {
      localStorage.setItem(
        "client_auth_meu-cliente",
        JSON.stringify({ client_id: "abc", email: "user@test.com", slug: "meu-cliente" })
      );
      renderProtectedRoute("meu-cliente", "/dashboard/meu-cliente");
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe("Req 12.5 — redireciona para login quando sessão inválida ou expirada", () => {
    it("redireciona para login quando localStorage contém JSON inválido", () => {
      localStorage.setItem("client_auth_meu-cliente", "not-valid-json{{{");
      renderProtectedRoute("meu-cliente", "/dashboard/meu-cliente");
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });

    it("redireciona para login quando sessão está faltando client_id", () => {
      localStorage.setItem(
        "client_auth_meu-cliente",
        JSON.stringify({ email: "user@test.com", slug: "meu-cliente" })
      );
      renderProtectedRoute("meu-cliente", "/dashboard/meu-cliente");
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });

    it("redireciona para login quando sessão está faltando slug", () => {
      localStorage.setItem(
        "client_auth_meu-cliente",
        JSON.stringify({ client_id: "abc", email: "user@test.com" })
      );
      renderProtectedRoute("meu-cliente", "/dashboard/meu-cliente");
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });

    it("redireciona para o login correto baseado no slug da URL", () => {
      // Sessão de outro slug não deve liberar acesso
      localStorage.setItem(
        "client_auth_outro-cliente",
        JSON.stringify({ client_id: "abc", email: "user@test.com", slug: "outro-cliente" })
      );
      renderProtectedRoute("meu-cliente", "/dashboard/meu-cliente");
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
  });
});
