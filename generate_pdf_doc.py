import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # Suppress running header/footer on title cover page
            return
        
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#475569"))
        
        # Running Header
        self.drawString(54, 752, "ZOHO PAYMENT RECONCILIATION & COLLECTIONS PLATFORM")
        self.setFont("Helvetica", 8)
        self.drawRightString(558, 752, "PROJECT DOCUMENTATION")
        
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.75)
        self.line(54, 744, 558, 744)
        
        # Running Footer
        self.line(54, 48, 558, 48)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 34, "CONFIDENTIAL & PROPRIETARY -- ZOHO INTEGRATION SUITE")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 34, page_text)
        self.restoreState()

def build_pdf(filename="Project_Documentation.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    PRIMARY = colors.HexColor("#0F172A")    # Dark slate
    SECONDARY = colors.HexColor("#1E3A8A")  # Deep blue
    ACCENT = colors.HexColor("#0D9488")     # Teal accent
    TEXT_DARK = colors.HexColor("#1E293B")  # Charcoal body text
    TEXT_MUTED = colors.HexColor("#64748B") # Muted text
    BG_LIGHT = colors.HexColor("#F8FAFC")   # Card background
    BORDER_COLOR = colors.HexColor("#E2E8F0")

    # Typography Styles
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        textColor=PRIMARY,
        spaceAfter=10
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=SECONDARY,
        spaceAfter=18
    )

    meta_style = ParagraphStyle(
        'CoverMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=14,
        textColor=TEXT_MUTED
    )

    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=PRIMARY,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=SECONDARY,
        spaceBefore=11,
        spaceAfter=5,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'SectionH3',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=ACCENT,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=TEXT_DARK,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'BulletCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=TEXT_DARK,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor("#1E293B")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=TEXT_DARK
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10.5,
        textColor=PRIMARY
    )

    story = []

    # ===============================
    # COVER / TITLE PAGE
    # ===============================
    story.append(Spacer(1, 10))
    story.append(Paragraph("ZOHO PAYMENT RECONCILIATION & COLLECTIONS INTELLIGENCE PLATFORM", title_style))
    story.append(Paragraph("Comprehensive Technical Architecture, System Engineering, Business Value, and Operational Manual", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2.5, color=ACCENT, spaceBefore=0, spaceAfter=14))
    
    meta_text = """
    <b>Document Version:</b> 1.0.0<br/>
    <b>Target System:</b> Zoho CRM & Zoho Books Integrated Web Application<br/>
    <b>Backend Stack:</b> Node.js (v18+) & Express Enterprise Middleware<br/>
    <b>Frontend Stack:</b> Vanilla HTML5 / ES6 JavaScript / Modern CSS (Zero Build Requirement)<br/>
    <b>Security Framework:</b> Server-Side OAuth2 Refresh Token Authorization<br/>
    <b>Publication Date:</b> September 2026<br/>
    <b>Scope:</b> End-to-End Application Architecture, Core Engines, Business Use Cases & Operational Playbook
    """
    story.append(Paragraph(meta_text, meta_style))
    story.append(Spacer(1, 14))

    # Executive Overview Box
    exec_summary_html = """
    <b>EXECUTIVE SUMMARY & SYSTEM PURPOSE:</b><br/>
    The <b>Zoho Payment Reconciliation & Collections Platform</b> is a high-performance, enterprise-grade web application designed to bridge the gap between sales agreements recorded in <b>Zoho CRM</b> ("Closed Won" deals) and financial receipts logged in <b>Zoho Books</b>. <br/><br/>
    The platform eliminates revenue leakage, automates multi-tier customer accounting cross-checks, provides predictive monthly collections forecasting across instalment schedules, and equips credit control teams with real-time, interactive chase tools and native dual-sheet Excel exports.
    """
    exec_table = Table(
        [[Paragraph(exec_summary_html, callout_style)]],
        colWidths=[504]
    )
    exec_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_COLOR),
        ('LINELEFT', (0, 0), (0, 0), 4, SECONDARY),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(exec_table)
    story.append(Spacer(1, 14))

    # TABLE OF CONTENTS / SUMMARY TABLE
    story.append(Paragraph("DOCUMENT STRUCTURE", h2_style))
    toc_data = [
        [Paragraph("Section", table_header_style), Paragraph("Title", table_header_style), Paragraph("Core Scope & Content", table_header_style)],
        [Paragraph("1", table_cell_bold), Paragraph("How the Application Works", table_cell_bold), Paragraph("Functional workflows, dual processing engines, 3-tier customer matching, insight dashboards, keep-alive heartbeat streaming, session persistence.", table_cell_style)],
        [Paragraph("2", table_cell_bold), Paragraph("How the Application is Made", table_cell_bold), Paragraph("Full technical breakdown, Node.js/Express architecture, lib/ module specifications, OAuth2 security, frontend shell, native XLSX OOXML builder.", table_cell_style)],
        [Paragraph("3", table_cell_bold), Paragraph("Uses of the Application", table_cell_bold), Paragraph("Business value propositions, revenue leakage prevention, cash flow forecasting, sales owner accountability, AR ageing & risk assessment.", table_cell_style)],
        [Paragraph("4", table_cell_bold), Paragraph("Daily Operational Guide", table_cell_bold), Paragraph("Day-to-day SOPs for Finance, Billing, Credit Control, Sales Managers, and IT Administrators; step-by-step usage procedures and troubleshooting.", table_cell_style)],
    ]
    toc_table = Table(toc_data, colWidths=[45, 150, 309])
    toc_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(toc_table)
    
    story.append(PageBreak())

    # ===============================
    # SECTION 1: HOW THE APPLICATION WORKS
    # ===============================
    story.append(Paragraph("1. How the Application Works", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1.1 System Architecture & Business Problem", h2_style))
    story.append(Paragraph(
        "In enterprise operations, sales teams manage deals within <b>Zoho CRM</b>, setting structured payment plans (e.g., Registration Fee, Instalments 1-3, Educational/Commercial Loans, or Full Upfront Payments). Meanwhile, finance teams issue invoices and record receipts in <b>Zoho Books</b>. "
        "Historically, cross-verifying whether deals marked as 'Closed Won' in CRM actually resulted in realized invoice payments in Books was a manual, error-prone task. Furthermore, evaluating upcoming cash flows across instalment schedules required cumbersome manual spreadsheets.",
        body_style
    ))
    story.append(Paragraph(
        "This web application operates as a real-time intelligence layer over Zoho CRM and Zoho Books. It provides two core computational engines:",
        body_style
    ))
    story.append(Paragraph("• <b>1. Reconciliation Engine (<code>/</code>)</b>: Performs deal-by-deal audit matching between CRM deal payment status and actual Zoho Books invoice payments.", bullet_style))
    story.append(Paragraph("• <b>2. Collections & Analytics Engine (<code>/collections.html</code> & 6 Insight Views)</b>: Explodes Closed Won deals into granular scheduled payment components and projects expected vs. collected revenue month-by-month.", bullet_style))

    story.append(Spacer(1, 4))
    story.append(Paragraph("1.2 The Reconciliation Engine & 3-Tier Customer Matching", h2_style))
    story.append(Paragraph(
        "When an administrator selects a deal closing date range (e.g., Jan 1, 2026 to Mar 31, 2026) and clicks <b>Run Report</b>, the reconciliation pipeline executes as follows:",
        body_style
    ))
    story.append(Paragraph("1. <b>CRM Deal Fetching</b>: The server queries Zoho CRM v2 API for all deals in <code>Stage = 'Closed Won'</code>, handling API pagination up to 10,000 records.", bullet_style))
    story.append(Paragraph("2. <b>Date Range Scoping</b>: Filters deals based on their exact <code>Closing_Date</code>.", bullet_style))
    story.append(Paragraph("3. <b>CRM Expected Total Calculation</b>: Analyzes the deal's <code>Payment_Type</code> (Full Payment, Instalments, or NACL Loan) and sums all components marked as paid via CRM checkboxes (<code>Registration_Amount_Paid</code>, <code>Instalment_1_Amount_Paid</code>, etc.).", bullet_style))
    story.append(Paragraph("4. <b>3-Tier Books Customer Matching</b>: For each deal, the system connects to Zoho Books to discover the matching customer contact and retrieve their invoices using a strictly ordered 3-tier algorithm:", bullet_style))

    # Table for 3-Tier Matching
    matching_data = [
        [Paragraph("Tier", table_header_style), Paragraph("Search Mechanism", table_header_style), Paragraph("Matching Criteria & Logic", table_header_style)],
        [Paragraph("Tier 1", table_cell_bold), Paragraph("Direct Email Search", table_cell_bold), Paragraph("Searches Books contacts by CRM <code>Email</code>. If matching contact is found with >0 invoices, customer ID is bound.", table_cell_style)],
        [Paragraph("Tier 2", table_cell_bold), Paragraph("Verified Phone Search", table_cell_bold), Paragraph("Extracts last 10 digits of CRM <code>Phone</code>. Searches Books contacts by phone. Only matches if the candidate's last 10 digits match CRM phone exactly (prevents loose substring mismatches).", table_cell_style)],
        [Paragraph("Tier 3", table_cell_bold), Paragraph("Contact Person Fallback", table_cell_bold), Paragraph("Executes <code>search_text</code> query using email or phone last 10 digits to catch secondary contacts listed under corporate customer records.", table_cell_style)],
    ]
    matching_table = Table(matching_data, colWidths=[45, 120, 339])
    matching_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(Spacer(1, 3))
    story.append(matching_table)
    story.append(Spacer(1, 4))

    # Validation Results table wrapped in KeepTogether
    val_data = [
        [Paragraph("Result", table_header_style), Paragraph("Condition", table_header_style), Paragraph("Operational Meaning", table_header_style)],
        [Paragraph("MATCH", table_cell_bold), Paragraph("|CRM Paid - Books Paid| &lt;= Rs.1", table_cell_style), Paragraph("CRM payment records agree perfectly with Zoho Books invoices.", table_cell_style)],
        [Paragraph("MISMATCH", table_cell_bold), Paragraph("CRM Paid != Books Paid", table_cell_style), Paragraph("Discrepancy detected (e.g. CRM shows paid but Books invoice is pending, or vice versa).", table_cell_style)],
        [Paragraph("MISMATCH", table_cell_bold), Paragraph("Customer Not Found", table_cell_style), Paragraph("No matching customer contact exists in Zoho Books across all 3 tiers.", table_cell_style)],
        [Paragraph("PENDING", table_cell_bold), Paragraph("CRM Paid = 0 & Books Paid = 0", table_cell_style), Paragraph("Deal has no payments marked paid in CRM and no receipts in Books.", table_cell_style)],
    ]
    val_table = Table(val_data, colWidths=[70, 150, 284])
    val_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))

    val_block = [
        Paragraph("5. <b>Financial Reconciliation & Status Categorization</b>: Compares the total paid amount calculated from CRM against total invoice payments recorded in Books (excluding credit notes). Assigns one of four validation results:", body_style),
        Spacer(1, 2),
        val_table
    ]
    story.append(KeepTogether(val_block))

    story.append(Spacer(1, 8))
    story.append(Paragraph("1.3 Collections & Month-Wise Bucketing Engine", h2_style))
    story.append(Paragraph(
        "The Collections Engine (<code>/collections.html</code>) shifts focus from accounting audits to cash flow forecasting and credit management. "
        "It explodes every Closed Won deal into its constituent scheduled payments (Instalments 1-3, Loan, Full Payment) and buckets them into calendar months based strictly on their CRM due dates.",
        body_style
    ))
    story.append(Paragraph("• <b>Due Date Parsing</b>: Enforces strict ISO calendar validation (<code>yyyy-MM-dd</code>). Invalid dates (e.g. <code>2026-02-29</code> or <code>10/03/2026</code>) are flagged in audit logs rather than guessed, preventing money from misallocating into wrong months.", bullet_style))
    story.append(Paragraph("• <b>Full Payment Handling</b>: Full payments carry no due date by definition. They are scoped to the date range using the deal's <code>Closing_Date</code> and categorized in a dedicated 'No due date' bucket.", bullet_style))
    story.append(Paragraph("• <b>Paid vs. Pending Determination</b>: A payment component is marked PENDING only if its CRM paid checkbox is <code>false</code>. If the expected date has passed today's date, it is classified as <b>Overdue / Past Due</b>.", bullet_style))

    story.append(Spacer(1, 8))
    story.append(Paragraph("1.4 The 7 Specialized Insight & Performance Dashboards", h2_style))
    story.append(Paragraph(
        "To serve different operational stakeholders, the application provides specialized analytical dashboards built on top of the collections dataset:",
        body_style
    ))

    dashboards_data = [
        [Paragraph("Dashboard Page", table_header_style), Paragraph("Target Audience", table_header_style), Paragraph("Core Question Answered & Capabilities", table_header_style)],
        [Paragraph("Collections (/collections.html)", table_cell_bold), Paragraph("Finance & Leadership", table_cell_bold), Paragraph("Monthly expected vs. collected revenue bar chart, KPI cards, pending drill-down modal, dual-sheet Excel chase list export.", table_cell_style)],
        [Paragraph("By Deal Owner (/owner-collections.html)", table_cell_bold), Paragraph("Sales Directors", table_cell_bold), Paragraph("Collection performance breakdown by sales representative and their underlying customer accounts.", table_cell_style)],
        [Paragraph("Batch Performance (/batches.html)", table_cell_bold), Paragraph("Course Operations", table_cell_bold), Paragraph("Evaluates collection rates and outstanding shortfalls grouped by student intake batches.", table_cell_style)],
        [Paragraph("Ageing & Overdue (/ageing.html)", table_cell_bold), Paragraph("Credit Control", table_cell_bold), Paragraph("Categorizes unpaid receivables into ageing buckets (0-30, 31-60, 61-90, 90+ days past due) with contact details.", table_cell_style)],
        [Paragraph("Payment Mix (/mix.html)", table_cell_bold), Paragraph("Strategy & Product", table_cell_bold), Paragraph("Compares collection velocity across payment shapes (Full Payment vs. Instalments vs. Educational Loans).", table_cell_style)],
        [Paragraph("Collection Trend (/trend.html)", table_cell_bold), Paragraph("Executive Team", table_cell_bold), Paragraph("Cumulative shortfall growth vs. monthly collection rates over time.", table_cell_style)],
        [Paragraph("At-Risk Deals (/risk.html)", table_cell_bold), Paragraph("Collection Agents", table_cell_bold), Paragraph("Prioritizes high-exposure overdue accounts with phone/email and expanding payment schedule details.", table_cell_style)],
    ]
    dashboards_table = Table(dashboards_data, colWidths=[120, 95, 289])
    dashboards_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(dashboards_table)

    story.append(Spacer(1, 8))
    story.append(Paragraph("1.5 Real-Time HTTP Keep-Alive Heartbeat Streaming", h2_style))
    story.append(Paragraph(
        "A full reconciliation report across thousands of deals requires making thousands of HTTP calls to Zoho Books. On cloud deployment platforms (such as Render, Heroku, or AWS ALB), edge proxies automatically terminate any connection that remains idle for ~100 seconds, resulting in browser errors like <code>Unexpected end of JSON input</code>.",
        body_style
    ))
    story.append(Paragraph(
        "To solve this cleanly without complex WebSockets, the application implements a custom HTTP streaming heartbeat protocol (<code>lib/heartbeat.js</code>):",
        body_style
    ))
    story.append(Paragraph("1. Immediately flushes HTTP 200 headers with <code>Content-Type: application/json</code> and <code>X-Accel-Buffering: no</code>.", bullet_style))
    story.append(Paragraph("2. Dribbles a single space character (<code>' '</code>) every 10 seconds while backend API loops execute.", bullet_style))
    story.append(Paragraph("3. Since leading whitespace is ignored by standard JSON parsers, when the final payload arrives, <code>JSON.parse()</code> processes the complete result seamlessly without proxy disconnections.", bullet_style))

    story.append(Spacer(1, 10))

    # ===============================
    # SECTION 2: HOW THE APPLICATION IS MADE
    # ===============================
    story.append(Paragraph("2. How the Application is Made", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("2.1 Architectural Overview & File Hierarchy", h2_style))
    story.append(Paragraph(
        "The project follows a clean, decoupled modular architecture. The backend is built with <b>Node.js & Express</b>, while the frontend consists of high-performance <b>Vanilla HTML5/JS/CSS</b> requiring no webpack, babel, or node_modules client dependencies.",
        body_style
    ))

    # Structured Project Hierarchy Table
    file_struct_data = [
        [Paragraph("Path / Module", table_header_style), Paragraph("Component Type", table_header_style), Paragraph("Description & Engineering Responsibility", table_header_style)],
        [Paragraph("server.js", table_cell_bold), Paragraph("Server Entry", table_cell_style), Paragraph("Express application initialization, trust proxy config, JSON error interceptor, static asset middleware, global error handling.", table_cell_style)],
        [Paragraph("lib/zohoAuth.js", table_cell_bold), Paragraph("OAuth Module", table_cell_style), Paragraph("Manages OAuth2 token refresh flow, in-memory caching (~60s refresh buffer), and diagnostic error messages.", table_cell_style)],
        [Paragraph("lib/zohoClient.js", table_cell_bold), Paragraph("API Transport", table_cell_style), Paragraph("Wraps fetch with OAuth headers, handles HTTP 204 No Content safely, pages through CRM deals, executes 3-tier customer search.", table_cell_style)],
        [Paragraph("lib/payments.js", table_cell_bold), Paragraph("Domain Logic", table_cell_style), Paragraph("Single source of truth for payment schedule breakdown, paidFlags extraction, strict ISO date parsing, lookup display formatting.", table_cell_style)],
        [Paragraph("lib/reconcile.js", table_cell_bold), Paragraph("Domain Logic", table_cell_style), Paragraph("Calculates CRM expected total, matches Books invoices, computes overdue days per instalment, assigns MATCH / MISMATCH / PENDING.", table_cell_style)],
        [Paragraph("lib/collections.js", table_cell_bold), Paragraph("Domain Logic", table_cell_style), Paragraph("Month-wise bucketing engine, aggregate metrics, exception handling (missing dates, invalid dates, unrecognised types).", table_cell_style)],
        [Paragraph("lib/heartbeat.js", table_cell_bold), Paragraph("Middleware", table_cell_style), Paragraph("HTTP streaming keep-alive protocol (dribbles ' ' every 10s) to prevent cloud proxy idle timeouts.", table_cell_style)],
        [Paragraph("lib/staticAssets.js", table_cell_bold), Paragraph("Middleware", table_cell_style), Paragraph("Cache-busting middleware: stamps HTML script/CSS URLs with ?v=BUILD_ID and enforces no-store headers.", table_cell_style)],
        [Paragraph("routes/report.js", table_cell_bold), Paragraph("Express Controller", table_cell_style), Paragraph("POST /api/run-report endpoint: executes reconciliation with concurrency control (CONCURRENCY = 5).", table_cell_style)],
        [Paragraph("routes/collections.js", table_cell_bold), Paragraph("Express Controller", table_cell_style), Paragraph("POST /api/collections endpoint: computes month-wise collection forecast payload.", table_cell_style)],
        [Paragraph("public/shell.js", table_cell_bold), Paragraph("Frontend Framework", table_cell_style), Paragraph("Unified dashboard shell: collapsible left nav rail, global date/filter state, KPI row builder, Shell.openDetail() panel.", table_cell_style)],
        [Paragraph("public/viz.js", table_cell_bold), Paragraph("Frontend Toolkit", table_cell_style), Paragraph("Viz.rupee() currency formatter, SVG bar/line chart engines (Viz.bars, Viz.lines), sortable Viz.DataTable, 10-min session cache.", table_cell_style)],
        [Paragraph("public/xlsx.js", table_cell_bold), Paragraph("Excel Builder", table_cell_style), Paragraph("In-house OOXML zip writer generating native binary .xlsx files (Pending Detail chase list & By Deal summary) in pure JS.", table_cell_style)],
    ]
    file_struct_table = Table(file_struct_data, colWidths=[110, 95, 299])
    file_struct_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(file_struct_table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("2.2 Deep-Dive into Backend Modules (<code>lib/</code>)", h2_style))

    story.append(Paragraph("• <code>lib/zohoAuth.js</code> -- OAuth2 Token Manager", h3_style))
    story.append(Paragraph(
        "Manages OAuth2 authentication with Zoho API services. Instead of using short-lived browser sessions, it reads a long-lived <code>ZOHO_REFRESH_TOKEN</code> from environment variables and exchanges it for a 3600-second access token. Access tokens are cached in memory and automatically refreshed 60 seconds before expiration. If token refresh fails, it provides detailed diagnostic messages pinpointing bad client IDs or expired grant codes.",
        body_style
    ))

    story.append(Paragraph("• <code>lib/zohoClient.js</code> -- API Transport & Pagination Engine", h3_style))
    story.append(Paragraph(
        "Wraps native <code>fetch</code> with Zoho authorization headers. Crucially, it handles Zoho's HTTP 204 'No Content' responses gracefully by returning an empty object rather than triggering JSON parse crashes. "
        "It includes <code>fetchAllClosedWonDeals()</code>, which pages through Zoho CRM search API (200 records/page, up to 50 pages) inspecting <code>info.more_records</code>. It also implements <code>findBooksCustomerAndInvoices()</code> for 3-tier customer resolution.",
        body_style
    ))

    story.append(Paragraph("• <code>lib/payments.js</code> -- Single Source of Truth for Payments", h3_style))
    story.append(Paragraph(
        "Acts as the single source of truth for payment schedule extraction. Defines <code>paidFlags(deal)</code> to normalize boolean checkboxes, <code>lookupName(raw)</code> to safely parse Zoho lookup objects, and <code>normaliseDate(raw)</code> for strict ISO date validation. "
        "The function <code>scheduledPayments(deal)</code> breaks down a deal into its active payment components, capturing deal name, owner, contact email, phone, batch name, closing date, and due date.",
        body_style
    ))

    story.append(Paragraph("• <code>lib/reconcile.js</code> -- Reconciliation Logic", h3_style))
    story.append(Paragraph(
        "Implements <code>reconcileDeal(deal, orgId)</code>. Calculates expected CRM paid total based on deal payment type, invokes Books customer matching, sorts valid invoice dates chronologically, computes overdue days per instalment using date arithmetic, and classifies the deal into MATCH, MISMATCH, or PENDING.",
        body_style
    ))

    story.append(Paragraph("• <code>lib/collections.js</code> -- Collections Calculation Engine", h3_style))
    story.append(Paragraph(
        "Implements <code>buildCollections(deals, fromDate, toDate, today)</code>. Generates continuous month keys between start and end dates, iterates over all scheduled payments, aggregates paid/pending/overdue amounts per month, and compiles exception metadata (missing due dates, invalid dates, unrecognised payment types).",
        body_style
    ))

    story.append(Spacer(1, 6))
    story.append(Paragraph("2.3 Deep-Dive into Frontend Framework (<code>public/</code>)", h2_style))

    story.append(Paragraph("• <code>public/viz.js</code> -- Data Visualization & Component Toolkit", h3_style))
    story.append(Paragraph(
        "A lightweight, zero-dependency utility library. Provides <code>Viz.rupee(amount)</code> for Indian currency formatting (e.g. Rs. 1,50,000), <code>Viz.bars</code> and <code>Viz.lines</code> for rendering responsive inline SVG charts using CSS custom properties, <code>Viz.DataTable</code> for rendering interactive sortable tables with live search, and a 10-minute client session cache.",
        body_style
    ))

    story.append(Paragraph("• <code>public/shell.js</code> -- Dashboard Application Shell", h3_style))
    story.append(Paragraph(
        "Provides the shared layout infrastructure for all analytical pages. Features a hover-expanding left navigation rail, unified top date range controls, global filter chips (batch, owner, payment type, search query), KPI summary cards, and the central <code>Shell.openDetail(deal)</code> slide-over panel for displaying complete customer payment schedules safely via <code>textContent</code> DOM injection.",
        body_style
    ))

    story.append(Paragraph("• <code>public/xlsx.js</code> -- Native Binary OOXML Excel Writer", h3_style))
    story.append(Paragraph(
        "An in-house XML zip builder that generates native Microsoft Excel (<code>.xlsx</code>) binary workbooks in pure JavaScript without third-party dependencies. "
        "It writes native numeric types, currency formats, and Excel date serials across multiple worksheets (e.g., 'Pending Detail' chase list and 'By Deal' summary), allowing finance teams to filter, sort, and sum data directly in Excel.",
        body_style
    ))

    story.append(Paragraph("• <code>lib/staticAssets.js</code> -- Cache Invalidation Middleware", h3_style))
    story.append(Paragraph(
        "Prevents browsers from executing stale client scripts after server deployments. Replaces script and stylesheet tags in HTML files with <code>?v=BUILD_ID</code> query parameters (tied to git commit hash) and enforces HTTP <code>Cache-Control: no-store</code> headers on HTML documents.",
        body_style
    ))

    story.append(Spacer(1, 8))

    # ===============================
    # SECTION 3: USES OF THE APPLICATION
    # ===============================
    # Wrap Section 3.1 in KeepTogether so heading and table stay together
    uses_data = [
        [Paragraph("Business Goal", table_header_style), Paragraph("Problem Addressed", table_header_style), Paragraph("Platform Feature & Solution", table_header_style)],
        [Paragraph("Revenue Leakage Prevention", table_cell_bold), Paragraph("Deals marked 'Closed Won' in CRM where sales reps checked paid boxes, but no actual invoice or payment exists in Books.", table_cell_style), Paragraph("<b>Reconciliation Engine (<code>/</code>)</b> flags <code>MISMATCH</code> deals instantly, highlighting exact dollar discrepancies and missing Books customer contacts.", table_cell_style)],
        [Paragraph("Cash Flow Forecasting", table_cell_bold), Paragraph("Uncertainty regarding upcoming instalment receipts and expected monthly cash inflows.", table_cell_style), Paragraph("<b>Collections Dashboard (<code>/collections.html</code>)</b> aggregates instalment schedules by month, showing exact expected, collected, and pending totals.", table_cell_style)],
        [Paragraph("Sales & Owner Accountability", table_cell_bold), Paragraph("Lack of visibility into which deal owners are carrying heavy overdue receivables.", table_cell_style), Paragraph("<b>By Deal Owner Dashboard (<code>/owner-collections.html</code>)</b> breaks down collected vs. outstanding funds per sales representative and account.", table_cell_style)],
        [Paragraph("Credit Control & Collections", table_cell_bold), Paragraph("Collection agents wasting time calling paid accounts or manually building chase lists.", table_cell_style), Paragraph("<b>At-Risk Deals (<code>/risk.html</code>)</b> & <b>Ageing Dashboard (<code>/ageing.html</code>)</b> prioritize worst-overdue accounts with direct email/phone details and instant Excel exports.", table_cell_style)],
        [Paragraph("CRM Data Quality Auditing", table_cell_bold), Paragraph("Garbage data in CRM (invalid due date formats like '10/03/2026', unmapped payment types).", table_cell_style), Paragraph("<b>Status Line Warnings</b> surface unparseable dates and incomplete records, enabling CRM admins to fix data hygiene issues proactively.", table_cell_style)],
    ]
    uses_table = Table(uses_data, colWidths=[110, 140, 254])
    uses_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))

    sec3_block = [
        Paragraph("3. Uses of the Application", h1_style),
        HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=2, spaceAfter=8),
        Paragraph("3.1 Primary Business Value Propositions", h2_style),
        Paragraph(
            "The application serves as a critical operational bridge between Sales, Finance, and Executive Management. Below are the primary business use cases and financial impacts delivered by the platform:",
            body_style
        ),
        Spacer(1, 4),
        uses_table
    ]
    story.append(KeepTogether(sec3_block))

    story.append(Spacer(1, 8))
    story.append(Paragraph("3.2 Impact Summary across Key Roles", h2_style))
    story.append(Paragraph("• <b>CFO & Finance Directors</b>: Gain total visibility over realized revenue vs. un-invoiced commitments, ensuring strict financial compliance.", bullet_style))
    story.append(Paragraph("• <b>Accounts Receivable & Billing Specialists</b>: Save 15+ hours weekly by replacing manual cross-checking between CRM and Books with 1-click automated matching.", bullet_style))
    story.append(Paragraph("• <b>Collection & Credit Control Teams</b>: Download pre-formatted, sorted Excel chase lists with phone numbers, emails, and overdue days pre-calculated.", bullet_style))
    story.append(Paragraph("• <b>Sales Operations & Managers</b>: Monitor individual rep collection efficiency during pipeline reviews and enforce payment collection before closing deals.", bullet_style))

    story.append(Spacer(1, 8))

    # ===============================
    # SECTION 4: DAILY OPERATIONAL GUIDE
    # ===============================
    story.append(Paragraph("4. Daily Operational Guide (Day-to-Day Use)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("4.1 Step-by-Step Daily SOP for Finance & Accounts Teams", h2_style))
    story.append(Paragraph("<b>Morning Audit Routine (09:00 AM) -- Running the Reconciliation Report:</b>", h3_style))
    story.append(Paragraph("1. Open the application URL and navigate to the <b>Reconciliation</b> page (<code>/</code>).", bullet_style))
    story.append(Paragraph("2. Select the desired deal closing date range (e.g. Current Month or Previous Quarter) using the date pickers.", bullet_style))
    story.append(Paragraph("3. Click <b>Run Report</b>. The system displays a live heartbeat status while fetching data from Zoho CRM and Books.", bullet_style))
    story.append(Paragraph("4. Once loaded, filter the table by status: click <code>MISMATCH</code> to inspect discrepancies.", bullet_style))
    story.append(Paragraph("5. Review the <b>Remarks</b> column for each mismatch deal:", bullet_style))
    story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;• If <i>'Customer not found in Books'</i>: Verify customer email/phone in CRM and create the contact in Books.", bullet_style))
    story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;• If <i>'CRM paid > Books paid'</i>: Check if payment was collected but invoice was not updated in Books.", bullet_style))
    story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;• If <i>'Books paid > CRM paid'</i>: Update CRM paid checkboxes to reflect realized payments.", bullet_style))
    story.append(Paragraph("6. Click <b>Export to CSV</b> to save the full audit log for accounting records.", bullet_style))

    story.append(Spacer(1, 6))
    story.append(Paragraph("4.2 Step-by-Step Daily SOP for Collection Agents & Credit Control", h2_style))
    story.append(Paragraph("<b>Daily Collection & Follow-Up Routine:</b>", h3_style))
    story.append(Paragraph("1. Navigate to <b>Collections</b> (<code>/collections.html</code>) or <b>At-Risk Deals</b> (<code>/risk.html</code>).", bullet_style))
    story.append(Paragraph("2. Click on the <b>Pending Tile</b> or click any month bar in the collection chart containing pending money.", bullet_style))
    story.append(Paragraph("3. The <b>Pending Drill-Down Modal</b> opens, listing all unpaid instalment payments sorted by most-overdue first.", bullet_style))
    story.append(Paragraph("4. Click <b>Download Excel</b>. This downloads a native <code>.xlsx</code> file containing:", bullet_style))
    story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;• Sheet 1: <i>Pending Detail</i> (Chase list with customer names, emails, phone numbers, overdue days, and amounts).", bullet_style))
    story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;• Sheet 2: <i>By Deal</i> (Deal-level aggregate totals and earliest due date).", bullet_style))
    story.append(Paragraph("5. Use the contact details in the modal or Excel sheet to make collection calls or send payment reminders.", bullet_style))
    story.append(Paragraph("6. Click any customer row in the table to open <code>Shell.openDetail()</code> and inspect their complete payment history.", bullet_style))

    story.append(Spacer(1, 6))
    story.append(Paragraph("4.3 Weekly Review SOP for Sales Management", h2_style))
    story.append(Paragraph("1. Open <b>By Deal Owner</b> (<code>/owner-collections.html</code>).", bullet_style))
    story.append(Paragraph("2. Review the top chart to evaluate outstanding balances across account managers.", bullet_style))
    story.append(Paragraph("3. Filter by a specific deal owner to see their customer portfolio in the bottom chart and table.", bullet_style))
    story.append(Paragraph("4. Address high-pending accounts during weekly 1-on-1 sales pipeline meetings.", bullet_style))

    story.append(Spacer(1, 6))
    story.append(Paragraph("4.4 Troubleshooting & System Maintenance", h2_style))

    trouble_data = [
        [Paragraph("Symptom / Error", table_header_style), Paragraph("Root Cause", table_header_style), Paragraph("Resolution Procedure", table_header_style)],
        [Paragraph("<code>invalid_code</code> on token refresh", table_cell_bold), Paragraph("ZOHO_REFRESH_TOKEN in .env is invalid or an unexchanged grant code was pasted.", table_cell_style), Paragraph("Generate a fresh grant code in Zoho API Console, then run:<br/><code>npm run get-refresh-token -- &lt;GRANT_CODE&gt; --write</code>", table_cell_style)],
        [Paragraph("Status line: <i>Unparseable due date</i>", table_cell_bold), Paragraph("CRM deal contains non-ISO date string (e.g. '10/03/2026' or 'invalid').", table_cell_style), Paragraph("Review sample dates in warning message. Locate record in Zoho CRM and update date field to standard calendar date format.", table_cell_style)],
        [Paragraph("Browser shows stale UI after deploy", table_cell_bold), Paragraph("Browser cached old static JS files.", table_cell_style), Paragraph("Automatic cache-buster stamps URLs with <code>?v=BUILD_ID</code>. Perform hard refresh (Ctrl+F5) if needed.", table_cell_style)],
    ]
    trouble_table = Table(trouble_data, colWidths=[120, 130, 254])
    trouble_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(trouble_table)

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceBefore=6, spaceAfter=6))
    story.append(Paragraph("<b>End of Documentation -- Zoho Payment Reconciliation & Collections Intelligence Platform</b>", ParagraphStyle(
        'EndDoc', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, alignment=1, textColor=TEXT_MUTED
    )))

    # Build Document using NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated documentation PDF: {os.path.abspath(filename)}")

if __name__ == "__main__":
    build_pdf()
