from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "output"
    / "pdf"
    / "honest-lenses-founder-go-no-go.pdf"
)


ROWS = [
    ("1", "Production schema/catalog baseline captured twice and checksummed", "NOT VERIFIED"),
    ("2", "Repository matches approved production baseline; no unexplained drift", "NOT VERIFIED"),
    ("3", "Migration history exact: Resend matched; two pending only", "PARTIAL"),
    ("4", "Backup completed and recovery point recorded", "NOT VERIFIED"),
    ("5", "PITR or approved backup RPO verified", "NOT VERIFIED"),
    ("6", "Restore-to-new-project rehearsal passed; RTO accepted", "NOT VERIFIED"),
    ("7", "Storage object recovery limitation accepted or covered", "NOT VERIFIED"),
    ("8", "Migration SQL, hashes, order, locks, role, transactions reviewed", "PASS"),
    ("9", "Rollback/forward recovery reviewed; operators named", "PLAN PASS / NAMES NV"),
    ("10", "Stripe test-mode validation passed", "PASS"),
    ("11", "Hosted Supabase RLS/API authorization passed", "PASS"),
    (
        "12",
        "Clean-profile hosted browser authorization passed OR waiver approved",
        "HTTP PASS / WAIVER APPROVAL NV",
    ),
    ("13", "Security database regression gate passed", "PASS"),
    ("14", "Repository tests pass at release commit", "FROZEN TREE PASS / RERUN"),
    ("15", "Production build passes at release commit", "FROZEN TREE PASS / RERUN"),
    ("16", "Commerce v2 disabled in code and every production runtime/worker", "CODE PASS / PROD NV"),
    ("17", "All production feature flags and release artifact verified", "NOT VERIFIED"),
    ("18", "Production Supabase/Stripe/hosting identities and credentials verified", "NOT VERIFIED"),
    (
        "19",
        "Write-drain control, canary, zero-write proof, and reopen verified",
        "IMPLEMENTATION PASS / PROD NV",
    ),
    ("20", "Smoke tests ready; live canary explicitly approved or waived", "PLAN PASS / DECISION NV"),
    ("21", "First-hour/day monitoring owners and dashboards prepared", "CHECKLIST / OWNERS NV"),
    ("22", "Abort thresholds, RPO, and RTO approved", "CRITERIA / APPROVAL NV"),
    ("23", "Dry run lists exactly 20260729144510 and 20260729160750", "NOT VERIFIED"),
    ("24", "Founder explicitly authorizes production execution", "NOT VERIFIED"),
]


def paragraph(text, style):
    return Paragraph(text.replace("&", "&amp;"), style)


def build_pdf():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    page_width, page_height = landscape(letter)
    document = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=(page_width, page_height),
        leftMargin=0.24 * inch,
        rightMargin=0.24 * inch,
        topMargin=0.20 * inch,
        bottomMargin=0.20 * inch,
        title="Honest Lenses Founder Go-No-Go",
        author="Honest Lenses",
        subject="Production migration decision checklist",
    )

    title_style = ParagraphStyle(
        "Title",
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#13233F"),
        spaceAfter=3,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        fontName="Helvetica",
        fontSize=7.4,
        leading=9,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#334155"),
    )
    header_style = ParagraphStyle(
        "Header",
        fontName="Helvetica-Bold",
        fontSize=7.4,
        leading=8.4,
        textColor=colors.white,
        alignment=TA_LEFT,
    )
    cell_style = ParagraphStyle(
        "Cell",
        fontName="Helvetica",
        fontSize=7,
        leading=8.2,
        textColor=colors.HexColor("#111827"),
        alignment=TA_LEFT,
    )
    small_style = ParagraphStyle(
        "Small",
        fontName="Helvetica",
        fontSize=7.5,
        leading=8.6,
        textColor=colors.HexColor("#111827"),
        alignment=TA_LEFT,
    )
    decision_style = ParagraphStyle(
        "Decision",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=9,
        textColor=colors.HexColor("#7F1D1D"),
        alignment=TA_LEFT,
    )

    story = [
        paragraph("HONEST LENSES - FOUNDER GO/NO-GO", title_style),
        paragraph(
            "Release/commit: ____________________   Window UTC: ____________________   "
            "Founder: ____________________   Rule: every required item must be PASS; "
            "NOT VERIFIED is NO-GO.",
            subtitle_style,
        ),
        Spacer(1, 4),
    ]

    table_data = [
        [
            paragraph("#", header_style),
            paragraph("Gate", header_style),
            paragraph("Decision - check one", header_style),
            paragraph("Current preparation evidence", header_style),
        ]
    ]
    for number, gate, current in ROWS:
        table_data.append(
            [
                paragraph(number, cell_style),
                paragraph(gate, cell_style),
                paragraph("[ ] PASS   [ ] FAIL   [ ] NOT VERIFIED", cell_style),
                paragraph(current, cell_style),
            ]
        )

    table = Table(
        table_data,
        colWidths=[0.25 * inch, 4.05 * inch, 2.05 * inch, 2.75 * inch],
        repeatRows=1,
        hAlign="CENTER",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E78")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#94A3B8")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
                ("TOPPADDING", (0, 0), (-1, -1), 1.8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8),
                (
                    "BACKGROUND",
                    (0, 1),
                    (-1, -1),
                    colors.HexColor("#F8FAFC"),
                ),
            ]
            + [
                (
                    "BACKGROUND",
                    (0, row_index),
                    (-1, row_index),
                    colors.HexColor("#EAF1F8"),
                )
                for row_index in range(2, len(table_data), 2)
            ]
        )
    )
    story.extend(
        [
            table,
            Spacer(1, 4),
            paragraph(
                "Decision: [ ] GO   [ ] NO-GO      Conditions/notes: "
                "____________________________________________________________",
                decision_style,
            ),
            paragraph(
                "Founder signature/time: ______________________________   "
                "Database operator: ______________________________",
                small_style,
            ),
            paragraph(
                "Current package recommendation: PACKAGE READY FOR EXECUTION-TIME "
                "CHECKS - DEPLOYMENT NOT AUTHORIZED.",
                decision_style,
            ),
        ]
    )

    document.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT_PATH)
