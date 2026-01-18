import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./sidebar";

// Mock usePathname to control active link
vi.mock("next/navigation", async () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
    }),
    usePathname: () => "/home",
  };
});

// Mock Link component
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("Sidebar", () => {
  it("renders the app name", () => {
    render(<Sidebar />);
    expect(screen.getByText("CLIP IN")).toBeInTheDocument();
  });

  it("renders all navigation links", () => {
    render(<Sidebar />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("FTP Tracker")).toBeInTheDocument();
    expect(screen.getByText("Workout Planner")).toBeInTheDocument();
    expect(screen.getByText("Class Search")).toBeInTheDocument();
  });

  it("renders navigation links with correct hrefs", () => {
    render(<Sidebar />);

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveAttribute("href", "/home");

    const ftpLink = screen.getByText("FTP Tracker").closest("a");
    expect(ftpLink).toHaveAttribute("href", "/ftp");

    const plannerLink = screen.getByText("Workout Planner").closest("a");
    expect(plannerLink).toHaveAttribute("href", "/planner");

    const searchLink = screen.getByText("Class Search").closest("a");
    expect(searchLink).toHaveAttribute("href", "/search");
  });

  it("renders the pro upgrade card", () => {
    render(<Sidebar />);

    // Check for Pro upgrade card
    expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });
});
