// Admin logout (Supabase) - robust version
// Works even if other helper files are missing.

async function supabaseSignOut() {
    // 1) If a global client exists (some setups attach it to window)
    if (window.supabase && window.supabase.auth && typeof window.supabase.auth.signOut === "function") {
        await window.supabase.auth.signOut();
        return true;
    }

    // 2) Try importing the project's Supabase client module (recommended)
    try {
        const mod = await import("../asset/js/supabaseClient.js");
        const client = mod.supabase || mod.default || mod.client || mod.supabaseClient;
        if (client && client.auth && typeof client.auth.signOut === "function") {
            await client.auth.signOut();
            return true;
        }
    } catch (e) {
        // ignore - we'll fall back below
    }

    // 3) As a last resort, try creating a client here (requires window keys)
    try {
        const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
        if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            const client = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            await client.auth.signOut();
            return true;
        }
    } catch (e) {
        // ignore
    }

    return false;
}

function clearLegacyAuthFlags() {
    try {
        const keys = [
            "adminLoggedIn",
            "adminEmail",
            "adminName",
            "employeeLoggedIn",
            "employeeRole",
            "employeeEmail",
            "employeeName",
            "userLoggedIn",
            "loggedIn",
            "currentUser",
            "current_user",
            "user",
            "role",
            "session",
        ];
        keys.forEach((k) => localStorage.removeItem(k));
        sessionStorage.clear();
    } catch (e) { }
}

async function doLogout(redirectTo) {
    clearLegacyAuthFlags();

    // Don't block sign out if Supabase fails — still redirect
    try { await supabaseSignOut(); } catch (e) { }

    const url = redirectTo || "admin-login.html";
    window.location.href = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
}

function wireLogoutButton(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", async (e) => {
        e.preventDefault();
        const ok = confirm("Logout?");
        if (!ok) return;
        await doLogout("admin-login.html");
    });
}

// Support both buttons in your dashboard
wireLogoutButton("btn-logout");
wireLogoutButton("btn-logout-top");

// Optional: allow links/buttons that use data-logout
document.querySelectorAll("[data-logout]").forEach((el) => {
    el.addEventListener("click", async (e) => {
        e.preventDefault();
        const ok = confirm("Logout?");
        if (!ok) return;
        await doLogout("admin-login.html");
    });
});
