import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
afterEach(cleanup);

vi.mock("./supabase", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: () => ({}) } }));
import { supabase } from "./supabase";
import { ModMenu, DeleteAccountDialog } from "./features/safety.jsx";
import { postErrorMessage } from "./lib/moderation.js";

describe("moderation", () => {
  it("explains the objectionable-content rejection", () => {
    expect(postErrorMessage({ message: "objectionable_content" })).toMatch(/isn't allowed/);
    expect(postErrorMessage({ message: "new row violates row-level security policy" })).toMatch(/can't post/);
  });

  it("shows no menu on your own content", () => {
    const { container } = render(<ModMenu kind="stock_post" contentId="p1" authorId="me" me="me" />);
    expect(container.innerHTML).toBe("");
  });

  it("reports someone else's post with the chosen reason", async () => {
    const say = vi.fn();
    render(<ModMenu kind="stock_post" contentId="p1" authorId="u2" authorName="bob" me="me" say={say} />);
    fireEvent.click(screen.getByLabelText(/report or block/i));
    fireEvent.click(screen.getByText(/Report this/));
    fireEvent.click(screen.getByText("Spam or self-promotion"));
    fireEvent.click(screen.getByText("Send report"));
    await vi.waitFor(() => expect(say).toHaveBeenCalled());
    expect(supabase.rpc).toHaveBeenCalledWith("report_content", { k: "stock_post", cid: "p1", why: "spam", note: null });
  });

  it("blocks after confirmation", async () => {
    const say = vi.fn();
    render(<ModMenu kind="user" contentId="u2" authorId="u2" authorName="bob" me="me" say={say} />);
    fireEvent.click(screen.getByLabelText(/report or block/i));
    fireEvent.click(screen.getByText("Block @bob"));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith("Blocked @bob."));
    expect(supabase.rpc).toHaveBeenCalledWith("block_user", { target: "u2" });
  });

  it("account deletion needs DELETE typed", () => {
    render(<DeleteAccountDialog onClose={() => {}} />);
    const btn = screen.getByText("Permanently delete my account");
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: "delete" } });
    expect(btn.disabled).toBe(false);
  });
});
