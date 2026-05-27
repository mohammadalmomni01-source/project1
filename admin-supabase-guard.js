import { requireRole } from "../asset/js/supabaseAuth.js";

(async () => {
    // Small delay to allow Supabase to recover session from storage
    await new Promise(r => setTimeout(r, 100));
    
    try {
        const ok = await requireRole(["admin", "employee"], "admin-login.html");
        if (ok) {
            console.log("[Guard] Access granted.");
        }
    } catch (e) {
        console.error("[Guard] Auth check failed:", e);
        // On error, better to redirect than to leave an insecure state
        window.location.href = "admin-login.html";
    }
})();
