import { NextRequest, NextResponse } from "next/server";
import { ContactService } from "@/services/contact.service";
import { ClinicService } from "@/services/clinic.service";

/**
 * GET /api/contacts
 *
 * Lista os pacientes/contatos da clínica com filtros básicos e paginação.
 * Usado pelo painel Admin (Passo 6).
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get("clinicId");

    if (!clinicId) {
        return NextResponse.json({ error: "clinicId is required" }, { status: 400 });
    }

    try {
        const isValid = await ClinicService.validateClinicId(clinicId);
        if (!isValid) return NextResponse.json({ error: "Invalid clinicId" }, { status: 404 });

        const options = {
            onlyHotLeads: searchParams.get("hotLeads") === "true" ? true : undefined,
            page: Number(searchParams.get("page") ?? 1),
            pageSize: Number(searchParams.get("pageSize") ?? 50),
        };

        const result = await ContactService.list(clinicId, options);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error("[get contacts] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
