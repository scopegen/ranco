"""Renders prescriptions and the full patient history as downloadable PDFs.

Uses xhtml2pdf (pure Python, no system dependencies) — build an HTML string,
convert it. xhtml2pdf only understands a CSS2.1-ish subset: no flexbox, no
CSS variables, no grid. Keep markup to tables/blocks with inline-ish rules.
"""

import io
from datetime import date, datetime
from html import escape as _esc
from pathlib import Path

from xhtml2pdf import pisa

FONTS_DIR = Path(__file__).parent / "fonts"
ASSETS_DIR = Path(__file__).parent / "assets"


def _font_uri(filename: str) -> str:
    # xhtml2pdf/reportlab needs a real file:// URI to load a local TTF.
    return FONTS_DIR.joinpath(filename).resolve().as_uri()


def _asset_uri(filename: str) -> str:
    # Unlike @font-face (which needs a real file:// URI), xhtml2pdf's <img>
    # src loader chokes on %20-encoded spaces in a file:// URI on Windows —
    # a plain filesystem path works for images.
    return str(ASSETS_DIR.joinpath(filename).resolve())


# Clinic letterhead — matches the printed Ranco Dental Clinic letterhead
# exactly (logo + tagline on the left, practising doctor's details on the
# right, teal rule, contact bar in the footer). Fallback/default doctor
# shown on invoice/history PDFs (which can span more than one doctor);
# prescription PDFs override this with the actual prescribing doctor — see
# _page_template_html's doctor_name/doctor_specialty/doctor_reg_no params.
CLINIC_NAME = "RANCO DENTAL"
CLINIC_TAGLINE = "Your Smile, Lifestyle"
CLINIC_ADDRESS = "Sector 141 Noida"
CLINIC_PHONE = "+91 93105 70154"
CLINIC_EMAIL = "noida@rancodental.com"
CLINIC_WEBSITE = "www.rancodental.com"
LETTERHEAD_DOCTOR_NAME = "Neha Baliyan"
LETTERHEAD_DOCTOR_SPECIALTY = "Dental Surgeon, Implantologist"
LETTERHEAD_DOCTOR_REG_NO = "A-17490"
PRESCRIPTION_DISCLAIMER = (
    "This document is valid only with the doctor's signature and clinic stamp. "
    "Please follow dosage instructions carefully."
)

ACCENT = "#1e5f8c"
ACCENT_DEEP = "#123f5c"
INK = "#171a15"
INK_SOFT = "#57667a"
RULE = "#d9dccf"
LETTERHEAD_BLUE = "#4fa3c4"
LETTERHEAD_TEAL = "#2b8fae"

BASE_CSS = f"""
@font-face {{ font-family: "Roboto"; src: url("{_font_uri('Roboto-Regular.ttf')}"); }}
@font-face {{ font-family: "Roboto"; src: url("{_font_uri('Roboto-Bold.ttf')}"); font-weight: bold; }}
@font-face {{ font-family: "Roboto"; src: url("{_font_uri('Roboto-Italic.ttf')}"); font-style: italic; }}
/* Named page frames — this is what makes the header/footer repeat as a
   fixed template on every page, xhtml2pdf-style: any element whose id is
   referenced by -pdf-frame-content is pulled out of normal flow and
   stamped into that frame on each page; the unnamed frame (content_frame)
   is where the rest of the body actually flows. */
@page {{
  size: A4;
  @frame header_frame {{
    -pdf-frame-content: header_content;
    top: 0.9cm; left: 1.8cm; width: 17.4cm; height: 3cm;
  }}
  @frame content_frame {{
    top: 4.2cm; left: 1.8cm; width: 17.4cm; height: 22.4cm;
  }}
  @frame footer_frame {{
    -pdf-frame-content: footer_content;
    top: 26.8cm; left: 1.8cm; width: 17.4cm; height: 2.5cm;
  }}
}}
body {{ font-family: "Roboto", Helvetica, Arial, sans-serif; font-size: 10pt; color: {INK}; }}
#header_content table {{ width: 100%; }}
#header_content .brand-cell {{ vertical-align: middle; }}
#header_content .brand-tagline {{ font-size: 9.5pt; font-weight: bold; color: {LETTERHEAD_TEAL}; margin: 3px 0 0; }}
#header_content .doctor-cell {{ vertical-align: middle; text-align: right; }}
#header_content .doctor-name {{ font-size: 15pt; font-weight: bold; color: {ACCENT_DEEP}; margin: 0; }}
#header_content .doctor-specialty {{ font-size: 9pt; color: {INK_SOFT}; margin: 2px 0 0; }}
#header_content .doctor-reg {{ font-size: 8.5pt; font-weight: bold; color: {INK}; margin: 2px 0 0; }}
#header_content .letterhead-rule {{ border-bottom: 2px solid {LETTERHEAD_BLUE}; margin: 8px 0 0; }}
#footer_content .footer-note {{ font-size: 8pt; color: {INK_SOFT}; font-style: italic; text-align: center; margin: 0 0 6px; }}
#footer_content .contact-footer-rule {{ border-bottom: 2px solid {LETTERHEAD_BLUE}; margin: 0 0 8px; }}
#footer_content table {{ width: 100%; }}
#footer_content td {{ font-size: 8.5pt; color: {INK_SOFT}; text-align: center; vertical-align: middle; padding: 0 4px; }}
#footer_content td b {{ color: {INK}; }}
#footer_content img {{ vertical-align: middle; margin-right: 5px; }}
.doc-title {{ font-size: 14pt; font-weight: bold; color: {ACCENT_DEEP}; margin: 0 0 12px; }}
.disclaimer {{ font-size: 8pt; color: {INK_SOFT}; padding-top: 6px; margin-top: 24px; font-style: italic; text-align: center; }}
hr.section-divider {{ border: none; border-top: 1px solid {RULE}; margin: 6px 0 12px; height: 0; }}
table.info {{ width: 100%; margin-bottom: 12px; }}
table.info td {{ padding: 2px 0; font-size: 9.5pt; vertical-align: top; }}
.label {{ font-weight: bold; color: {INK_SOFT}; }}
/* One field per row, label/colon/value each their own column — the label
   column is a fixed width so the colons line up regardless of how long
   each label is ("Patient" vs "Patient ID" vs "Gender" ...). */
table.field-table {{ width: 100%; margin-bottom: 12px; border-collapse: collapse; }}
table.field-table td {{ padding: 3px 0; font-size: 9.5pt; vertical-align: top; }}
table.field-table .field-label {{ width: 85pt; font-weight: bold; color: {INK_SOFT}; white-space: nowrap; }}
table.field-table .field-colon {{ width: 10pt; color: {INK_SOFT}; }}
table.field-table .field-value {{ color: {INK}; }}
/* Same idea, two fields per row (patient info) — six columns: label/colon/
   value, twice, each pair sized so both sides' colons line up in their own
   column, independent of the other side's label lengths. */
table.field-table-2col {{ width: 100%; margin-bottom: 12px; border-collapse: collapse; }}
table.field-table-2col td {{ padding: 3px 0; font-size: 9.5pt; vertical-align: top; }}
table.field-table-2col .field-label {{ width: 20%; font-weight: bold; color: {INK_SOFT}; white-space: nowrap; }}
table.field-table-2col .field-colon {{ width: 3%; color: {INK_SOFT}; }}
table.field-table-2col .field-value {{ width: 27%; color: {INK}; }}
.entry {{ margin-bottom: 16px; padding: 10px 0 14px; border-bottom: 1px solid {RULE}; }}
.entry-page {{ margin-top: 6px; }}
.rx-date {{ font-size: 12pt; font-weight: bold; color: {ACCENT_DEEP}; margin: 0 0 10px; }}
.entry-head {{ font-size: 9.5pt; color: {INK_SOFT}; margin-bottom: 6px; }}
.entry-head b {{ color: {INK}; }}
.rx-title {{ font-size: 13pt; font-style: italic; font-weight: bold; color: {ACCENT}; margin: 6px 0 4px; }}
.rx-line {{ padding: 2px 0 2px 14px; font-size: 9.5pt; }}
.section-title {{ font-size: 13pt; font-weight: bold; color: {ACCENT_DEEP}; margin: 18px 0 8px; border-bottom: 1px solid {RULE}; padding-bottom: 4px; }}
table.rows {{ width: 100%; border-collapse: collapse; margin-bottom: 10px; }}
table.rows th {{ text-align: left; font-size: 8pt; text-transform: uppercase; color: {INK_SOFT}; border-bottom: 1px solid {RULE}; padding: 4px 6px; }}
table.rows td {{ font-size: 9.5pt; border-bottom: 1px solid {RULE}; padding: 5px 6px; }}
.pill {{ font-size: 8pt; padding: 2px 7px; border-radius: 8px; }}
.pill-paid {{ background: #e5f5ec; color: #2f8f5b; }}
.pill-unpaid {{ background: #f3f6fa; color: {INK_SOFT}; }}
.summary td {{ font-size: 10pt; padding: 4px 10px 4px 0; }}
.summary .amt {{ font-weight: bold; }}
"""


def _age(dob: date | None, birth_year: int | None) -> int:
    """Exact age when the full DOB is known; a year-precision estimate
    (no month/day to compare against) when only the birth year is known."""
    if dob is not None:
        today = date.today()
        years = today.year - dob.year
        if (today.month, today.day) < (dob.month, dob.day):
            years -= 1
        return years
    return date.today().year - birth_year


def patient_id_str(patient_number: int) -> str:
    return f"RANCO-{patient_number:04d}"


# header_content/footer_content are pulled out of normal flow by the
# @page frame rules above (matched by id) and stamped onto every page —
# this is the repeating letterhead template. doc_title stays in the
# regular content flow (shown once, where the content actually starts).
#
# doctor_name/doctor_specialty/doctor_reg_no: override the static clinic
# letterhead with a specific doctor's own details — used by the prescription
# PDFs (one doctor per document) so the header shows whoever actually wrote
# it rather than always the same hardcoded name. Left unset, every other
# document (invoice, history) keeps the static clinic-letterhead doctor.
# footer_note: an extra line stamped above the contact-info bar on every
# page — e.g. the prescription's "valid only with signature/stamp" notice.
# Left unset, the footer is just the contact bar (invoice/history for now).
def _page_template_html(
    doctor_name: str | None = None,
    doctor_specialty: str | None = None,
    doctor_reg_no: str | None = None,
    footer_note: str | None = None,
) -> str:
    name = _display_doctor_name(doctor_name) if doctor_name else LETTERHEAD_DOCTOR_NAME
    specialty = doctor_specialty if doctor_name else LETTERHEAD_DOCTOR_SPECIALTY
    reg_no = doctor_reg_no if doctor_name else LETTERHEAD_DOCTOR_REG_NO
    specialty_html = f'<p class="doctor-specialty">{_esc(specialty)}</p>' if specialty else ""
    reg_no_html = f'<p class="doctor-reg">Reg. No. {_esc(reg_no)}</p>' if reg_no else ""
    footer_note_html = f'<p class="footer-note">{_esc(footer_note)}</p>' if footer_note else ""
    return f"""
    <div id="header_content">
      <table>
        <tr>
          <td class="brand-cell" width="55%">
            <img src="{_asset_uri('ranco-logo.png')}" width="150" height="37.5" />
            <p class="brand-tagline">{CLINIC_TAGLINE}</p>
          </td>
          <td class="doctor-cell" width="45%">
            <p class="doctor-name">Dr. {_esc(name)}</p>
            {specialty_html}
            {reg_no_html}
          </td>
        </tr>
      </table>
      <div class="letterhead-rule"></div>
    </div>
    <div id="footer_content">
      {footer_note_html}
      <div class="contact-footer-rule"></div>
      <table>
        <tr>
          <td width="25%"><img src="{_asset_uri('icon-pin.png')}" width="11" height="11" /> {CLINIC_ADDRESS}</td>
          <td width="25%"><img src="{_asset_uri('icon-phone.png')}" width="11" height="11" /> <b>{CLINIC_PHONE}</b></td>
          <td width="25%"><img src="{_asset_uri('icon-mail.png')}" width="11" height="11" /> {CLINIC_EMAIL}</td>
          <td width="25%"><img src="{_asset_uri('icon-globe.png')}" width="11" height="11" /> {CLINIC_WEBSITE}</td>
        </tr>
      </table>
    </div>
    """


def _doc_title_html(doc_title: str) -> str:
    return f'<p class="doc-title">{_esc(doc_title)}</p>'


def _patient_info_html(patient) -> str:
    return f"""
    <table class="info">
      <tr>
        <td width="50%"><span class="label">Patient:</span> {_esc(patient.name)}</td>
        <td width="50%"><span class="label">Patient ID:</span> {patient_id_str(patient.patient_number)}</td>
      </tr>
      <tr>
        <td><span class="label">Age / Sex:</span> {_age(patient.dob, patient.birth_year)} yrs</td>
        <td><span class="label">Phone:</span> {_esc(patient.phone)}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="label">Address:</span> {_esc(', '.join(p for p in [patient.sector, patient.city] if p))}</td>
      </tr>
    </table>
    """


def _field_row(label: str, value: str) -> str:
    """One label:value line, single column — a fixed-width label column so
    the colon lines up regardless of label length. `value` is inserted as-is
    (callers _esc it)."""
    return f'<tr><td class="field-label">{_esc(label)}</td><td class="field-colon">:</td><td class="field-value">{value}</td></tr>'


def _field_row_pair(label1: str, value1: str, label2: str, value2: str) -> str:
    """One row, two label:value fields side by side — each side's colon
    lines up in its own column independent of the other side's label
    lengths. `value1`/`value2` are inserted as-is (callers _esc them)."""
    return (
        f'<tr><td class="field-label">{_esc(label1)}</td><td class="field-colon">:</td><td class="field-value">{value1}</td>'
        f'<td class="field-label">{_esc(label2)}</td><td class="field-colon">:</td><td class="field-value">{value2}</td></tr>'
    )


def _prescription_patient_info_html(patient) -> str:
    """Two fields per row, three rows — Patient/Patient ID, Age/Gender,
    Phone/Address. The shared _patient_info_html's "Age / Sex" label never
    actually printed a sex/gender value; this fixes that too. Scoped to
    prescription PDFs only for now; the invoice/history layout is being
    redone separately."""
    gender = _esc(patient.gender.value.capitalize()) if patient.gender else "—"
    address = _esc(", ".join(p for p in [patient.sector, patient.city] if p))
    rows = "".join(
        [
            _field_row_pair("Patient", _esc(patient.name), "Patient ID", patient_id_str(patient.patient_number)),
            _field_row_pair("Age", f"{_age(patient.dob, patient.birth_year)} yrs", "Gender", gender),
            _field_row_pair("Phone", _esc(patient.phone), "Address", address),
        ]
    )
    return f'<table class="field-table-2col">{rows}</table>'


def _display_doctor_name(name: str) -> str:
    """Staff names may already include a "Dr." prefix (as seeded) — don't double it up."""
    stripped = name.strip()
    if stripped.lower().startswith("dr."):
        stripped = stripped[3:].strip()
    elif stripped.lower().startswith("dr "):
        stripped = stripped[2:].strip()
    return stripped


def _prescription_entry_html(
    entry,
    doctor_name: str,
    doctor_specialty: str | None,
    page_mode: bool = False,
    chief_complaint: str | None = None,
) -> str:
    """page_mode: used only by the per-entry prescription PDFs (single and
    combined), where each entry is its own standalone page with its own
    letterhead already crediting the doctor — so, unlike render_history_pdf's
    compact list-style rendering (page_mode=False), no date or doctor line
    is repeated in the body here; the date/day block is rendered separately,
    above the patient info, by the caller.
    chief_complaint: only set when this entry is linked to a consultation —
    consultations already capture it, so it's passed in from there rather
    than duplicated onto PrescriptionEntry itself."""
    rx_lines = "".join(
        f'<div class="rx-line">{i + 1}. {_esc(line)}</div>'
        for i, line in enumerate(entry.notes.splitlines())
        if line.strip()
    )
    complaint_html = (
        f'<p><span class="label">Chief Complaint:</span> {_esc(chief_complaint)}</p>' if chief_complaint else ""
    )
    diagnosis_html = f'<p><span class="label">Diagnosis:</span> {_esc(entry.diagnosis)}</p>' if entry.diagnosis else ""
    advice_html = f'<p><span class="label">Advice:</span> {_esc(entry.advice)}</p>' if entry.advice else ""
    next_visit_html = (
        f'<p><span class="label">Next Visit:</span> {_esc(entry.next_visit)}</p>' if entry.next_visit else ""
    )
    specialty_str = f" &middot; {_esc(doctor_specialty)}" if doctor_specialty else ""

    if page_mode:
        entry_head_html = ""
        wrapper_class = "entry-page"
    else:
        doctor_line = (
            f'<b>Dr. {_esc(_display_doctor_name(doctor_name))}</b>{specialty_str}'
            f' &mdash; <b>{entry.created_at.strftime("%d %b %Y")}</b>'
        )
        entry_head_html = f'<div class="entry-head">{doctor_line}</div>'
        wrapper_class = "entry"

    return f"""
    <div class="{wrapper_class}">
      {entry_head_html}
      {complaint_html}
      {diagnosis_html}
      <p class="rx-title"><i>Rx</i></p>
      {rx_lines or '<div class="rx-line">&mdash;</div>'}
      {advice_html}
      {next_visit_html}
    </div>
    """


def render_prescription_pdf(
    patient, entries: list, staff_by_id: dict, chief_complaint_by_entry_id: dict | None = None
) -> bytes:
    """entries: PrescriptionEntry rows for this patient, any order — sorted
    newest first here. Each entry gets its own page (its own dated
    prescription slip), not a rolled-up "history" list. Covers entries from
    however many different doctors, so — unlike render_single_prescription_pdf
    — the letterhead stays the static clinic default rather than any one
    doctor's own details."""
    chief_complaint_by_entry_id = chief_complaint_by_entry_id or {}
    sorted_entries = sorted(entries, key=lambda e: e.created_at, reverse=True)

    pages = []
    for i, e in enumerate(sorted_entries):
        entry_html = _prescription_entry_html(
            e,
            staff_by_id[e.added_by].name if e.added_by in staff_by_id else "Unknown",
            staff_by_id[e.added_by].specialty if e.added_by in staff_by_id else None,
            page_mode=True,
            chief_complaint=chief_complaint_by_entry_id.get(e.id),
        )
        # No single per-page date/day fits in the header here (unlike
        # render_single_prescription_pdf) — the header/footer are one fixed
        # frame shared by every page, and this document covers several
        # entries/dates at once. Kept inline instead, same field-table style.
        date_block = f'<table class="field-table">{_field_row("Date", e.created_at.strftime("%d %b %Y"))}{_field_row("Day", e.created_at.strftime("%A"))}</table>'
        break_style = ' style="page-break-before: always;"' if i > 0 else ""
        divider = '<hr class="section-divider" />'
        pages.append(
            f"<div{break_style}>{date_block}{divider}{_prescription_patient_info_html(patient)}"
            f"{divider}{entry_html}</div>"
        )

    body = "".join(pages)
    if not body:
        body = _prescription_patient_info_html(patient) + '<p style="color:#8894a3;">No prescriptions recorded yet.</p>'

    html = f"""
    <html><head><style>{BASE_CSS}</style></head>
    <body>
      {_page_template_html(footer_note=PRESCRIPTION_DISCLAIMER)}
      {body}
    </body></html>
    """
    return _to_pdf(html)


def render_single_prescription_pdf(
    patient,
    entry,
    doctor_name: str,
    doctor_specialty: str | None,
    doctor_reg_no: str | None = None,
    chief_complaint: str | None = None,
) -> bytes:
    """One prescription entry, one PDF — the per-consultation/per-visit
    "view"/"download" buttons each hit this instead of the combined,
    every-entry-ever document render_prescription_pdf produces. One doctor
    per document here, so the letterhead shows that actual doctor (name,
    specialty, registration no.) instead of the static clinic default —
    which also means the doctor's name doesn't need repeating in the body."""
    entry_html = _prescription_entry_html(
        entry, doctor_name, doctor_specialty, page_mode=True, chief_complaint=chief_complaint
    )
    date_block = (
        f'<table class="field-table">'
        f'{_field_row("Date", entry.created_at.strftime("%d %b %Y"))}'
        f'{_field_row("Day", entry.created_at.strftime("%A"))}'
        f"</table>"
    )
    html = f"""
    <html><head><style>{BASE_CSS}</style></head>
    <body>
      {_page_template_html(doctor_name, doctor_specialty, doctor_reg_no, PRESCRIPTION_DISCLAIMER)}
      {date_block}
      <hr class="section-divider" />
      {_prescription_patient_info_html(patient)}
      <hr class="section-divider" />
      {entry_html}
    </body></html>
    """
    return _to_pdf(html)


def render_history_pdf(
    patient,
    staff_by_id: dict,
    service_by_id: dict,
    consultations: list,
    treatments: list,
    visits_by_treatment: dict,
    consultation_charge_by_id: dict,
    treatment_charge_by_id: dict,
    invoice_by_treatment: dict,
    invoice_by_consultation: dict,
    billing_totals: tuple,
    prescriptions: list,
) -> bytes:
    """consultation_charge_by_id / treatment_charge_by_id: id -> (fee or
    service_price, discount_amount, charge) — what this one consultation or
    treatment contributes to the patient's single combined bill (payment
    itself isn't tracked per-item anymore).
    invoice_by_treatment / invoice_by_consultation: id -> (Invoice, this
    item's line amount on it), only present for treatments/consultations
    that have been invoiced.
    billing_totals: (total_billed, total_paid) for the whole patient, from
    the same calculation the Billing tab's summary tiles use."""

    def doctor_name(staff_id) -> str:
        s = staff_by_id.get(staff_id)
        return s.name if s else "Unknown"

    def service_name(service_id) -> str:
        s = service_by_id.get(service_id)
        return s.name if s else "Unknown"

    # ---- Consultations ----
    consult_row_list = []
    for c in sorted(consultations, key=lambda c: c.consult_date, reverse=True):
        _fee, c_discount_amount, c_charge = consultation_charge_by_id.get(c.id, (float(c.fee), 0.0, float(c.fee)))
        c_discount_note = f" (after Rs. {c_discount_amount:,.0f} discount)" if c_discount_amount else ""

        invoice_line = invoice_by_consultation.get(c.id)
        c_invoice_note = ""
        if invoice_line:
            invoice, line_amount = invoice_line
            c_invoice_note = (
                f'<br/><span style="font-size:8pt; color:{INK_SOFT};">Invoice: Rs. {line_amount:,.0f} '
                f'settled via {invoice.payment_mode.value.upper()} on {invoice.issued_at.strftime("%d %b %Y")}</span>'
            )

        consult_row_list.append(
            f"""<tr>
          <td>{c.consult_date.strftime('%d %b %Y')}</td>
          <td>{_esc(doctor_name(c.doctor_id))}</td>
          <td>{_esc(c.oral_examination)}</td>
          <td>Rs. {c_charge:,.0f}{c_discount_note}{c_invoice_note}</td>
          <td><span class="pill {'pill-paid' if c.payment_status.value == 'paid' else 'pill-unpaid'}">{c.payment_status.value}</span></td>
        </tr>"""
        )
    consult_rows = "".join(consult_row_list)
    consult_section = f"""
    <p class="section-title">Consultations</p>
    <table class="rows">
      <tr><th>Date</th><th>Doctor</th><th>Oral Examination</th><th>Fee</th><th>Status</th></tr>
      {consult_rows or '<tr><td colspan="5">None recorded.</td></tr>'}
    </table>
    """

    # ---- Treatments &amp; visits ----
    treatment_blocks = []
    for t in sorted(treatments, key=lambda t: t.started_at, reverse=True):
        visits = visits_by_treatment.get(t.id, [])
        # Visits are an activity log only now — no per-visit price/status;
        # a treatment is billed once, as a whole (see billing_html below).
        visit_rows = "".join(f"<tr><td>{v.visit_date.strftime('%d %b %Y')}</td></tr>" for v in visits)

        _service_price, discount_amount, charge = treatment_charge_by_id.get(t.id, (0.0, 0.0, 0.0))
        discount_note = f" (after Rs. {discount_amount:,.0f} discount)" if discount_amount else ""
        billing_html = (
            f'<p style="font-size:9.5pt;"><span class="label">Charge:</span> '
            f"Rs. {charge:,.0f}{discount_note}</p>"
        )

        invoice_line = invoice_by_treatment.get(t.id)
        invoice_html = ""
        if invoice_line:
            invoice, line_amount = invoice_line
            invoice_html = (
                f'<p style="font-size:9.5pt;"><span class="label">Invoice:</span> '
                f"Rs. {line_amount:,.0f} settled via {invoice.payment_mode.value.upper()} "
                f'on {invoice.issued_at.strftime("%d %b %Y")}</p>'
            )

        treatment_blocks.append(f"""
        <div style="margin-bottom:14px;">
          <p style="font-size:11pt; font-weight:bold; margin:0 0 2px;">{_esc(service_name(t.service_id))}
            <span style="font-weight:normal; font-size:9pt; color:{INK_SOFT};"> &mdash; {_esc(doctor_name(t.doctor_id))} &middot; {t.status.value} &middot; started {t.started_at.strftime('%d %b %Y')}{f" &middot; finished {t.completed_at.strftime('%d %b %Y')}" if t.completed_at else ""}</span>
          </p>
          <table class="rows">
            <tr><th>Visit date</th></tr>
            {visit_rows or '<tr><td>No visits logged.</td></tr>'}
          </table>
          {billing_html}
          {invoice_html}
        </div>
        """)

    treatments_section = f"""
    <p class="section-title">Treatments &amp; Visits</p>
    {"".join(treatment_blocks) or '<p style="color:#8894a3;">None recorded.</p>'}
    """

    total_billed, total_collected = billing_totals
    outstanding = max(0.0, total_billed - total_collected)

    billing_section = f"""
    <p class="section-title">Billing Summary</p>
    <table class="summary">
      <tr><td class="label">Total billed</td><td class="amt">Rs. {total_billed:,.0f}</td></tr>
      <tr><td class="label">Collected</td><td class="amt">Rs. {total_collected:,.0f}</td></tr>
      <tr><td class="label">Outstanding</td><td class="amt">Rs. {outstanding:,.0f}</td></tr>
    </table>
    """

    # ---- Prescriptions ----
    prescriptions_html = "".join(
        _prescription_entry_html(
            e,
            doctor_name(e.added_by),
            staff_by_id[e.added_by].specialty if e.added_by in staff_by_id else None,
        )
        for e in sorted(prescriptions, key=lambda e: e.created_at, reverse=True)
    )
    prescriptions_section = f"""
    <p class="section-title">Prescriptions</p>
    {prescriptions_html or '<p style="color:#8894a3;">None recorded.</p>'}
    """

    html = f"""
    <html><head><style>{BASE_CSS}</style></head>
    <body>
      {_page_template_html()}
      {_doc_title_html("Complete Patient History")}
      {_patient_info_html(patient)}
      <p style="font-size:9pt; color:{INK_SOFT};">Registered: {patient.registered_at.strftime('%d %b %Y')}</p>
      {consult_section}
      {treatments_section}
      {billing_section}
      {prescriptions_section}
      <p class="disclaimer">Generated {datetime.now().strftime('%d %b %Y, %H:%M')} &mdash; {CLINIC_NAME} patient record. For clinical/administrative use.</p>
    </body></html>
    """
    return _to_pdf(html)


def render_invoice_pdf(patient, lines: list[dict], invoice) -> bytes:
    """lines: [{'service_name': str, 'doctor_name': str, 'amount': float}, ...]
    — one per treatment or consultation this invoice covers (a consultation
    line's service_name is just "Consultation"). `amount` is already the
    exact amount charged for that item (discount, if any, already folded
    in) — the invoice shows only what was actually charged, never a
    discount breakdown; discount stays visible only on the Billing tab."""
    line_rows = "".join(
        f"""<tr>
          <td>{_esc(line['service_name'])}</td>
          <td>Dr. {_esc(_display_doctor_name(line['doctor_name']))}</td>
          <td>Rs. {line['amount']:,.0f}</td>
        </tr>"""
        for line in lines
    )

    html = f"""
    <html><head><style>{BASE_CSS}</style></head>
    <body>
      {_page_template_html()}
      {_doc_title_html("Invoice")}
      {_patient_info_html(patient)}
      <table class="info">
        <tr>
          <td width="50%"><span class="label">Invoice date:</span> {invoice.issued_at.strftime('%d %b %Y, %H:%M')}</td>
          <td width="50%"><span class="label">Payment mode:</span> {invoice.payment_mode.value.upper()}</td>
        </tr>
      </table>

      <p class="section-title">Items billed</p>
      <table class="rows">
        <tr><th>Service</th><th>Doctor</th><th>Amount</th></tr>
        {line_rows or '<tr><td colspan="3">No items on this invoice.</td></tr>'}
      </table>

      <table class="summary" style="margin-top:8px;">
        <tr><td class="label" style="font-size:11pt;">Amount payable</td><td class="amt" style="font-size:11pt;">Rs. {float(invoice.final_total):,.0f}</td></tr>
      </table>

      <p class="disclaimer">This is a system-generated invoice from {CLINIC_NAME}. For billing queries, please contact the clinic directly.</p>
    </body></html>
    """
    return _to_pdf(html)


def _to_pdf(html: str) -> bytes:
    buf = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buf)
    if result.err:
        raise RuntimeError("Failed to generate PDF")
    return buf.getvalue()