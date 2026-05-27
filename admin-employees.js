import { supabase } from "../asset/js/supabaseClient.js";

const form = document.getElementById("employeeForm");
const editForm = document.getElementById("employeeEditForm");
const tableBody = document.getElementById("employeesBody");
const alertBox = document.getElementById("alertBox");

function setAlert(message, type = "info") {
    if (!alertBox) return;
    alertBox.textContent = message || "";
    alertBox.className = `alert ${type}`;
    alertBox.style.display = message ? "block" : "none";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function extractInvokeErrorMessage(error, data) {
    if (data?.error) return data.error;
    if (!error) return "Failed request.";

    const ctx = error.context;
    if (ctx && typeof ctx.json === "function") {
        try {
            const payload = await ctx.json();
            if (payload?.error) return payload.error;
        } catch (_) { }
    }

    return error.message || "Failed request.";
}

async function requireAdmin() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
        window.location.href = "./admin-login.html";
        return null;
    }

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

    if (error || !profile || profile.role !== "admin") {
        await supabase.auth.signOut();
        window.location.href = "./admin-login.html";
        return null;
    }

    return session;
}

async function invokeAdminFunction(functionName, body) {
    const session = await requireAdmin();
    if (!session) return { data: null, error: { message: "Not authorized" } };

    return await supabase.functions.invoke(functionName, {
        body,
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });
}

function fillEditForm(row) {
    if (!editForm) return;
    editForm.user_id.value = row.id || "";
    editForm.full_name.value = row.full_name || "";
    editForm.email.value = row.email || "";
    editForm.password.value = "";
    const role = row.employee_role === "supplier_management" ? "supplier_manager" : (row.employee_role || "order_support");
    editForm.employee_role.value = role;
    editForm.status.value = row.status || "active";
}

function renderEmployees(rows) {
    if (!tableBody) return;

    tableBody.innerHTML = (rows || [])
        .map((row) => `
            <tr>
                <td><code>${escapeHtml(row.id)}</code></td>
                <td>${escapeHtml(row.full_name || "-")}</td>
                <td>${escapeHtml(row.email || "-")}</td>
                <td>${escapeHtml(row.employee_role || "-")}</td>
                <td>${escapeHtml(row.status || "-")}</td>
                <td><button type="button" class="submit" data-edit-id="${escapeHtml(row.id)}" style="padding:6px 10px; border-radius:10px;">Edit</button></td>
            </tr>
        `)
        .join("");

    if (!rows || rows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">No employees yet.</td></tr>';
        return;
    }

    tableBody.querySelectorAll("[data-edit-id]").forEach((button) => {
        button.addEventListener("click", () => {
            const found = rows.find((r) => String(r.id) === String(button.dataset.editId));
            if (!found) return;
            fillEditForm(found);
            setAlert("Editing selected employee.", "info");
            editForm?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    });
}

let employeesCache = [];

async function loadEmployees() {
    const { data, error } = await invokeAdminFunction("list-employees", {});

    if (error || !data?.ok) {
        const msg = await extractInvokeErrorMessage(error, data);
        setAlert(`Failed to load employees: ${msg}`, "error");
        renderEmployees([]);
        return;
    }

    employeesCache = Array.isArray(data.employees) ? data.employees : [];
    renderEmployees(employeesCache);
}

async function addEmployee(event) {
    event.preventDefault();

    const formData = new FormData(form);
    const full_name = String(formData.get("full_name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const employee_role = String(formData.get("role") || "").trim();

    if (!full_name || !email || !password || !employee_role) {
        setAlert("All fields are required.", "error");
        return;
    }

    setAlert("Adding employee...", "info");

    const { data, error } = await invokeAdminFunction("create-employee", {
        email,
        password,
        full_name,
        employee_role,
    });

    if (error || !data?.ok) {
        const msg = await extractInvokeErrorMessage(error, data);
        setAlert(msg, "error");
        return;
    }

    setAlert("Employee saved successfully.", "success");
    form.reset();
    await loadEmployees();
}

async function saveEmployee(event) {
    event.preventDefault();

    const formData = new FormData(editForm);
    const payload = {
        user_id: String(formData.get("user_id") || "").trim(),
        full_name: String(formData.get("full_name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
        employee_role: String(formData.get("employee_role") || "").trim(),
        status: String(formData.get("status") || "").trim(),
    };

    if (!payload.user_id || !payload.full_name || !payload.email || !payload.employee_role || !payload.status) {
        setAlert("Select an employee and complete all required edit fields.", "error");
        return;
    }

    setAlert("Saving employee...", "info");

    const { data, error } = await invokeAdminFunction("update-employee", payload);
    if (error || !data?.ok) {
        const msg = await extractInvokeErrorMessage(error, data);
        setAlert(msg, "error");
        return;
    }

    setAlert("Employee updated successfully.", "success");
    await loadEmployees();
}

if (form) form.addEventListener("submit", addEmployee);
if (editForm) editForm.addEventListener("submit", saveEmployee);

await loadEmployees();
