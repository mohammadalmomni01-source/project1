import { supabase } from "../asset/js/supabaseClient.js";

const LOGIN_URL = "./admin-login.html";
const reqBody = document.getElementById("reqBody");
const reqFilter = document.getElementById("reqFilter");
const reqRefresh = document.getElementById("reqRefresh");

let requestsCache = [];
let handlersBound = false;

async function requireAdmin() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
        window.location.href = LOGIN_URL;
        return null;
    }

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

    if (error || (profile?.role !== "admin" && profile?.role !== "employee")) {
        await supabase.auth.signOut();
        window.location.href = LOGIN_URL;
        return null;
    }

    return session;
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[m]));
}

function money(value) {
    const n = Number(value || 0);
    return $;
}

function prettyDate(value) {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleString();
    } catch (_) {
        return String(value);
    }
}

async function invokeFn(fnName, body) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
        const err = new Error("Missing session token");
        err.status = 401;
        throw err;
    }

    const { data, error } = await supabase.functions.invoke(fnName, {
        body,
        headers: {
            Authorization: Bearer ,
        },
    });

    if (error) {
        const status = error?.context?.status || error?.status || 500;
        const message = error?.message || "Function invoke failed";
        console.error("Function invoke error", { fnName, status, error });
        alert(${fnName} failed (): );
        const err = new Error(message);
        err.status = status;
        throw err;
    }

    return data;
}

function renderRows(list) {
    if (!reqBody) return;
    reqBody.innerHTML = (list || []).map((r) => \
    <tr>
      <td>\</td>
      <td>\</td>
      <td>\</td>
      <td>\</td>
      <td>\</td>
      <td>\</td>
      <td>\</td>
      <td>\</td>
      <td>
        <button data-act="view" data-id="\">View</button>
        <button data-act="approve" data-id="\">Approve</button>
        <button data-act="reject" data-id="\">Reject</button>
      </td>
    </tr>
  \).join("") || \<tr><td colspan="9">No requests found.</td></tr>\;
}

async function loadRequests() {
    let query = supabase
        .from("product_requests")
        .select("id,created_at,provider_name,provider_email,name,category,price,stock,status")
        .order("created_at", { ascending: false });

    const selected = String(reqFilter?.value || "all").toLowerCase();
    if (selected !== "all") query = query.eq("status", selected);

    const { data, error } = await query;
    if (error) {
        console.error("loadRequests error", error);
        alert(\Failed to load requests: \\);
        return;
    }

    requestsCache = data || [];
    renderRows(requestsCache);
}

async function onView(id) {
    const { data, error } = await supabase
        .from("product_requests")
        .select("id,name,category,price,stock,provider_email,provider_name,description,image_url,status")
        .eq("id", id)
        .maybeSingle();

    if (error || !data) {
        alert(\Failed to load details: \\);
        return;
    }

    alert(
        [
            \Name: \\,
            \Category: \\,
            \Price: \\,
            \Stock: \\,
            \Provider: \\,
            \Provider Email: \\,
            \Description: \\,
            \Image URL: \\,
            \Status: \\,
        ].join("\n")
    );
}

async function onApprove(id) {
    if (!confirm("Approve this item?")) return;
    try {
        try {
            const data = await invokeFn("approve-product", { request_id: id });
            console.log("approve request_id", id);
            console.log("approve response", data);
        } catch (edgeErr) {
            console.warn("Edge function error (continuing to fallback):", edgeErr);
        }

        // --- START FALLBACK INSERTION ---
        const { data: req } = await window.supabase.from("product_requests").select("*").eq("id", id).single();
        if (req) {
            const { data: existing } = await window.supabase.from("products").select("id").eq("request_id", id).maybeSingle();
            if (!existing) {
                await window.supabase.from("products").insert({
                    provider_id: req.provider_id,
                    request_id: id,
                    name: req.name,
                    category: req.category,
                    price: req.price,
                    stock: req.stock,
                    image_url: req.image_url,
                    description: req.description
                });
            }
            if (req.status !== "approved") {
                await window.supabase.from("product_requests").update({ status: "approved" }).eq("id", id);
            }
        }
        // --- END FALLBACK INSERTION ---

        alert("Approved ✓");
        await loadRequests();
    } catch (err) {
        const status = err?.status || "unknown";
        alert(`Approve failed (${status}): ${err?.message || err}`);
    }
}

async function onReject(id) {
    if (!confirm("Reject this item?")) return;
    try {
        const data = await invokeFn("reject-product", { request_id: id });
        console.log("reject request_id", id);
        console.log("reject response", data);
        alert("Rejected ?");
        await loadRequests();
    } catch (err) {
        const status = err?.status || "unknown";
        alert(\Reject failed (\): \\);
    }
}

function bindHandlers() {
    if (handlersBound) return;
    handlersBound = true;

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-act][data-id]");
        if (!btn) return;

        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        if (!id || !act) return;

        if (act === "view") return onView(id);
        if (act === "approve") return onApprove(id);
        if (act === "reject") return onReject(id);
    });

    reqFilter?.addEventListener("change", () => {
        loadRequests().catch((err) => console.error(err));
    });

    reqRefresh?.addEventListener("click", () => {
        loadRequests().catch((err) => console.error(err));
    });
}

async function init() {
    const session = await requireAdmin();
    if (!session) return;
    bindHandlers();
    await loadRequests();
}

init().catch((err) => {
    console.error("item-requests init error", err);
    alert(\Item Requests failed: \\);
});
