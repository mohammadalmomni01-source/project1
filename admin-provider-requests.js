import { supabase } from "../asset/js/supabaseClient.js";

const tbody = document.getElementById("reqBody");
const errBox = document.getElementById("err");

function showErr(msg) {
    if (!errBox) return;
    errBox.textContent = msg || "";
    errBox.style.display = msg ? "block" : "none";
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function render(rows) {
    if (!tbody) return;

    tbody.innerHTML = (rows || [])
        .map((r) => {
            const status = (r.status || "pending").toLowerCase();
            const canAct = status === "pending";

            const approveBtn = canAct
                ? `<button class="btn approve" data-act="approve" data-id="${r.id}">Approve</button>`
                : "";
            const rejectBtn = canAct
                ? `<button class="btn reject" data-act="reject" data-id="${r.id}">Reject</button>`
                : "";

            return `
        <tr>
          <td><code>${r.id}</code></td>
          <td>${escapeHtml(r.full_name)}</td>
          <td>${escapeHtml(r.email)}</td>
          <td>${escapeHtml(r.phone)}</td>
          <td>${escapeHtml(r.company_name || "")}</td>
          <td style="font-weight:800">${escapeHtml(status)}</td>
          <td>${escapeHtml(r.notes || "")}</td>
          <td style="display:flex; gap:8px; flex-wrap:wrap">${approveBtn}${rejectBtn}</td>
        </tr>
      `;
        })
        .join("");
}

async function requireAdmin() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
        alert("Session expired. Please login again.");
        window.location.href = "../admin/admin-login.html";
        return null;
    }

    const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

    if (error || !prof || (prof.role !== "admin" && prof.role !== "employee")) {
        alert("Not authorized");
        await supabase.auth.signOut();
        window.location.href = "../admin/admin-login.html";
        return null;
    }

    return session;
}

async function invokeAdminFunction(functionName, requestId) {
    const session = await requireAdmin();
    if (!session) return { data: null, error: new Error("Not authorized") };

    return await supabase.functions.invoke(functionName, {
        body: { request_id: requestId },
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });
}

async function getRequestById(requestId) {
    const { data, error } = await supabase
        .from("provider_requests")
        .select("id, auth_user_id, full_name")
        .eq("id", requestId)
        .single();

    if (error) return null;
    return data || null;
}

async function fallbackApprove(requestId) {
    const reqRow = await getRequestById(requestId);

    const { error: statusErr } = await supabase
        .from("provider_requests")
        .update({ status: "approved" })
        .eq("id", requestId);

    if (statusErr) return { ok: false, error: statusErr.message || "Failed to update request status" };

    if (reqRow?.auth_user_id) {
        const { error: profileErr } = await supabase
            .from("profiles")
            .upsert(
                {
                    id: reqRow.auth_user_id,
                    full_name: reqRow.full_name || null,
                    role: "provider",
                },
                { onConflict: "id" }
            );

        if (profileErr) {
            const msg = String(profileErr.message || "").toLowerCase();
            if (msg.includes("row-level security policy") || msg.includes("permission denied")) {
                return {
                    ok: true,
                    warning: "Status updated, but profiles role sync is blocked by RLS in fallback mode. Deploy/enable Edge Functions for full sync.",
                };
            }
            return { ok: false, error: profileErr.message || "Status updated, but profile role update failed" };
        }
    }

    return { ok: true };
}

async function fallbackReject(requestId) {
    const reqRow = await getRequestById(requestId);

    const { error: statusErr } = await supabase
        .from("provider_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);

    if (statusErr) return { ok: false, error: statusErr.message || "Failed to update request status" };

    if (reqRow?.auth_user_id) {
        const { error: profileErr } = await supabase
            .from("profiles")
            .upsert(
                {
                    id: reqRow.auth_user_id,
                    role: "rejected_provider",
                },
                { onConflict: "id" }
            );

        if (profileErr) {
            const msg = String(profileErr.message || "").toLowerCase();
            if (msg.includes("row-level security policy") || msg.includes("permission denied")) {
                return {
                    ok: true,
                    warning: "Status updated, but profiles role sync is blocked by RLS in fallback mode. Deploy/enable Edge Functions for full sync.",
                };
            }
            return { ok: false, error: profileErr.message || "Status updated, but profile role update failed" };
        }
    }

    return { ok: true };
}

function isEdgeUnavailable(error, data) {
    const msg = `${error?.message || ""} ${data?.error || ""}`.toLowerCase();
    return msg.includes("failed to send a request to the edge function") || msg.includes("function not found");
}

async function approveRequest(requestId) {
    const { data, error } = await invokeAdminFunction("approve-provider", requestId);

    if (!error && data?.ok) {
        alert("Approved ✅");
        window.location.reload();
        return;
    }

    if (isEdgeUnavailable(error, data)) {
        const fallback = await fallbackApprove(requestId);
        if (!fallback.ok) {
            alert(`Approve failed: ${fallback.error || "Unknown error"}`);
            return;
        }
        const note = fallback.warning ? `\n${fallback.warning}` : "";
        alert(`Approved ✅\n(Edge Function unavailable, used DB fallback)${note}`);
        window.location.reload();
        return;
    }

    alert(`Approve failed: ${error?.message || data?.error || "Unknown error"}`);
}

async function rejectRequest(requestId) {
    const { data, error } = await invokeAdminFunction("reject-provider", requestId);

    if (!error && data?.ok) {
        alert("Rejected ✅");
        window.location.reload();
        return;
    }

    if (isEdgeUnavailable(error, data)) {
        const fallback = await fallbackReject(requestId);
        if (!fallback.ok) {
            alert(`Reject failed: ${fallback.error || "Unknown error"}`);
            return;
        }
        const note = fallback.warning ? `\n${fallback.warning}` : "";
        alert(`Rejected ✅\n(Edge Function unavailable, used DB fallback)${note}`);
        window.location.reload();
        return;
    }

    alert(`Reject failed: ${error?.message || data?.error || "Unknown error"}`);
}

async function loadRequests() {
    showErr("");
    const { data, error } = await supabase
        .from("provider_requests")
        .select("id, auth_user_id, full_name, email, phone, company_name, notes, status, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        showErr("Failed to fetch");
        render([]);
        return;
    }

    render(data || []);
}

async function main() {
    const session = await requireAdmin();
    if (!session) return;

    await loadRequests();

    document.addEventListener("click", (e) => {
        const btn = e.target?.closest?.("button[data-act]");
        if (!btn) return;

        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id");
        if (!id) return;

        if (act === "approve") approveRequest(id);
        if (act === "reject") rejectRequest(id);
    });
}

main();
