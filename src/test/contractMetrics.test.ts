import { describe, it, expect } from "vitest";
import { computeContractMetrics } from "@/lib/contractMetricsCore";

describe("computeContractMetrics", () => {
  it("counts suspensions and reactivations for current month", () => {
    const now = new Date("2026-03-13T12:00:00.000Z");
    const res = computeContractMetrics({
      now,
      contracts: [
        {
          id: "c1",
          client_id: "cl1",
          status: "suspenso",
          created_at: "2026-01-01T00:00:00.000Z",
          metadata: { suspended_at: "2026-03-01T10:00:00.000Z" },
        },
        {
          id: "c2",
          client_id: "cl2",
          status: "ativo",
          created_at: "2026-01-01T00:00:00.000Z",
          metadata: { reactivated_at: "2026-03-02T10:00:00.000Z" },
        },
      ],
      payments: [],
    });

    expect(res.suspendedTotal).toBe(1);
    expect(res.suspendedMonth).toBe(1);
    expect(res.reactivatedMonth).toBe(1);
    expect(res.suspendedClientIdsMonth).toEqual(["cl1"]);
    expect(res.reactivatedVsSuspendedPercent).toBe(100);
  });

  it("detects overdue total and overdue-over-30 contracts", () => {
    const now = new Date("2026-03-13T00:00:00.000Z");
    const res = computeContractMetrics({
      now,
      overdueDaysToSuspend: 30,
      contracts: [],
      payments: [
        {
          id: "p1",
          contract_id: "ct1",
          client_id: "cl1",
          due_date: "2026-01-01",
          paid_at: null,
          status: "pendente",
          value: 100,
        },
        {
          id: "p2",
          contract_id: "ct2",
          client_id: "cl2",
          due_date: "2026-03-01",
          paid_at: null,
          status: "pendente",
          value: 50,
        },
      ],
    });

    expect(res.overdueTotalValue).toBe(150);
    expect(res.overdueOver30ContractIds).toEqual(["ct1"]);
  });

  it("computes delinquency received in month and percent vs overdue", () => {
    const now = new Date("2026-03-13T00:00:00.000Z");
    const res = computeContractMetrics({
      now,
      contracts: [],
      payments: [
        {
          id: "p1",
          contract_id: "ct1",
          client_id: "cl1",
          due_date: "2026-02-01",
          paid_at: "2026-03-05T10:00:00.000Z",
          status: "pago",
          value: 100,
        },
        {
          id: "p2",
          contract_id: "ct2",
          client_id: "cl2",
          due_date: "2026-03-02",
          paid_at: "2026-03-05T10:00:00.000Z",
          status: "pago",
          value: 80,
        },
        {
          id: "p3",
          contract_id: "ct3",
          client_id: "cl3",
          due_date: "2026-02-10",
          paid_at: null,
          status: "pendente",
          value: 200,
        },
      ],
    });

    expect(res.delinquencyReceivedMonthValue).toBe(100);
    expect(res.overdueTotalValue).toBe(200);
    expect(res.delinquencyReceivedMonthPercentOfOverdue).toBe(50);
  });
});

