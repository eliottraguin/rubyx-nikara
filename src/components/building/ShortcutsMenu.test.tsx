import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShortcutsMenu } from "./ShortcutsMenu";

describe("raccourcis des sections", () => {
  it("ouvre directement l'étage : Clients = Salle du courrier, Pub = Studio pub", () => {
    render(<ShortcutsMenu path="/carte" />);
    const list = screen.getByRole("list", { name: "Raccourcis", hidden: true });
    const links = within(list).getAllByRole("link", { hidden: true });
    expect(links.map((l) => l.textContent)).toEqual(["Prospection", "Clients", "Pub"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/carte", "/immeuble?etage=courrier", "/immeuble?etage=pub"]);
  });
});
