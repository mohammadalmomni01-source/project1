import { supabase } from "../asset/js/supabaseClient.js";
import { getSession, getMyProfile } from "../asset/js/supabaseAuth.js";
import { normalizeEmployeeRole } from "../asset/js/employee-guard.js";

const u = document.getElementById("u"); // email
const p = document.getElementById("p");
const err = document.getElementById("err");

function setSessionFlags(profile, userEmail) {
    const role = (profile?.role || "").toLowerCase().trim();
    if (role === "admin") {
        localStorage.setItem("adminLoggedIn", "true");
        localStorage.setItem("adminEmail", userEmail);
        localStorage.setItem("adminName", profile.full_name || "Admin");
        // Clear employee flags to avoid confusion
        localStorage.removeItem("employeeLoggedIn");
        localStorage.removeItem("employeeRole");
    } else if (role === "employee") {
        localStorage.setItem("employeeLoggedIn", "true");
        localStorage.setItem("employeeRole", normalizeEmployeeRole(profile.employee_role));
        localStorage.setItem("employeeName", profile.full_name || "Employee");
        localStorage.setItem("employeeEmail", userEmail);
        // Clear admin flags to avoid confusion
        localStorage.removeItem("adminLoggedIn");
    }
}

async function init() {
    const session = await getSession();
    if (session) {
        const profile = await getMyProfile();
        if (profile) {
            const role = (profile.role || "").toLowerCase().trim();
            if (role === "admin" || role === "employee") {
                setSessionFlags(profile, session.user.email);
                window.location.href = "admin-dashboard-modern.html";
                return;
            }
        }
    }
}
init();

async function doLogin() {
    err.style.display = "none";
    const email = (u.value || "").trim();
    const password = (p.value || "").trim();

    if (!email || !password) {
        err.textContent = "Please enter email and password.";
        err.style.display = "block";
        return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data?.session) {
        err.textContent = "Wrong email or password.";
        err.style.display = "block";
        return;
    }

    const profile = await getMyProfile();
    const role = (profile?.role || "").toLowerCase().trim();
    const status = (profile?.status || "").toLowerCase().trim();

    if ((role !== "admin" && role !== "employee") || (status && status !== "active")) {
        await supabase.auth.signOut();
        err.textContent = "Not authorized.";
        err.style.display = "block";
        return;
    }

    setSessionFlags(profile, data.session.user.email);
    window.location.href = "admin-dashboard-modern.html";
}

document.getElementById("loginBtn").addEventListener("click", doLogin);
document.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
