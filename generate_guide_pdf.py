#!/usr/bin/env python3
"""
MarketBrew Beta Guide PDF Generator
Generates a PDF guide with screenshots for the beta testing program.
Uses STHeiti font for proper Chinese character rendering.
"""

import asyncio
import os
from datetime import datetime
from playwright.async_api import async_playwright
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image,
    Table, TableStyle, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Constants
SCREENSHOT_DIR = "/Users/kedeng/Desktop/projects/stock-agent/guide-screenshots"
OUTPUT_PDF = "/Users/kedeng/Desktop/projects/stock-agent/MarketBrew_Beta_Guide.pdf"
BASE_URL = "http://localhost:3000"

# Register Chinese font - Use STHeiti which is available on macOS
# STHeiti Light.ttc contains Chinese glyphs and works well with reportlab
CHINESE_FONT_PATH = '/System/Library/Fonts/STHeiti Light.ttc'
CHINESE_FONT = 'STHeiti'

try:
    pdfmetrics.registerFont(TTFont(CHINESE_FONT, CHINESE_FONT_PATH, subfontIndex=0))
    print(f"Registered Chinese font: {CHINESE_FONT}")
except Exception as e:
    print(f"Warning: Could not register Chinese font: {e}")
    CHINESE_FONT = 'Helvetica'

# Brand colors
EMERALD = colors.HexColor('#059669')
DARK_BG = colors.HexColor('#050506')


async def capture_screenshots():
    """Capture all required screenshots using Playwright."""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1200, 'height': 800},
            device_scale_factor=2
        )
        page = await context.new_page()

        screenshots = {}

        # 1. Today page (Standard Daily Report)
        print("Capturing Today page...")
        await page.goto(f"{BASE_URL}/today", wait_until='networkidle')
        await page.wait_for_timeout(2000)
        screenshots['today'] = f"{SCREENSHOT_DIR}/today.png"
        await page.screenshot(path=screenshots['today'], full_page=False)

        # 2. Login page
        print("Capturing Login page...")
        await page.goto(f"{BASE_URL}/login", wait_until='networkidle')
        await page.wait_for_timeout(1000)
        screenshots['login'] = f"{SCREENSHOT_DIR}/login.png"
        await page.screenshot(path=screenshots['login'], full_page=False)

        # 3. Login with test account
        print("Logging in...")
        await page.fill('input[type="email"]', 'test@marketbrew.test')
        await page.fill('input[type="password"]', 'TestPass123!')
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(3000)

        # 4. For You page (Personal Digest)
        print("Capturing For You page...")
        await page.goto(f"{BASE_URL}/for-you", wait_until='networkidle')
        await page.wait_for_timeout(2000)
        screenshots['foryou'] = f"{SCREENSHOT_DIR}/foryou.png"
        await page.screenshot(path=screenshots['foryou'], full_page=False)

        # 5. Unsubscribe page
        print("Capturing Unsubscribe page...")
        await page.goto(f"{BASE_URL}/unsubscribe", wait_until='networkidle')
        await page.wait_for_timeout(1000)
        screenshots['unsubscribe'] = f"{SCREENSHOT_DIR}/unsubscribe.png"
        await page.screenshot(path=screenshots['unsubscribe'], full_page=False)

        await browser.close()
        print("All screenshots captured!")
        return screenshots


def create_styles():
    """Create custom paragraph styles with Chinese font support."""
    styles = getSampleStyleSheet()

    # Title style
    styles.add(ParagraphStyle(
        name='ChineseTitle',
        fontName=CHINESE_FONT,
        fontSize=28,
        leading=36,
        alignment=1,
        textColor=EMERALD,
        spaceAfter=20
    ))

    # Subtitle style
    styles.add(ParagraphStyle(
        name='ChineseSubtitle',
        fontName=CHINESE_FONT,
        fontSize=14,
        leading=20,
        alignment=1,
        textColor=colors.gray,
        spaceAfter=30
    ))

    # Heading style
    styles.add(ParagraphStyle(
        name='ChineseHeading',
        fontName=CHINESE_FONT,
        fontSize=18,
        leading=24,
        textColor=EMERALD,
        spaceBefore=20,
        spaceAfter=12
    ))

    # Subheading style
    styles.add(ParagraphStyle(
        name='ChineseSubheading',
        fontName=CHINESE_FONT,
        fontSize=14,
        leading=20,
        textColor=colors.black,
        spaceBefore=15,
        spaceAfter=8
    ))

    # Body style
    styles.add(ParagraphStyle(
        name='ChineseBody',
        fontName=CHINESE_FONT,
        fontSize=11,
        leading=18,
        textColor=colors.black,
        spaceAfter=8
    ))

    # List item style
    styles.add(ParagraphStyle(
        name='ChineseListItem',
        fontName=CHINESE_FONT,
        fontSize=11,
        leading=16,
        leftIndent=20,
        textColor=colors.black
    ))

    # Note style
    styles.add(ParagraphStyle(
        name='ChineseNote',
        fontName=CHINESE_FONT,
        fontSize=10,
        leading=14,
        textColor=colors.gray,
        leftIndent=10,
        alignment=1
    ))

    return styles


def generate_pdf(screenshots):
    """Generate the PDF guide with proper Chinese font support."""
    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )

    styles = create_styles()
    story = []

    # ==================== Cover Page ====================
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph("MarketBrew", styles['ChineseTitle']))
    story.append(Paragraph("内测指南", styles['ChineseTitle']))
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("AI 驱动的市场分析平台", styles['ChineseSubtitle']))
    story.append(Paragraph(f"版本 1.0 | {datetime.now().strftime('%Y年%m月%d日')}", styles['ChineseSubtitle']))
    story.append(PageBreak())

    # ==================== Table of Contents ====================
    story.append(Paragraph("目录", styles['ChineseHeading']))
    story.append(Spacer(1, 0.3*inch))

    toc_data = [
        ["1. 功能概述", "3"],
        ["2. 标准化日报 (Daily Report)", "4"],
        ["3. 专属日报 (Personal Digest)", "6"],
        ["4. 发送时间", "8"],
        ["5. 订阅与取消订阅", "9"],
    ]

    toc_table = Table(toc_data, colWidths=[4*inch, 1*inch])
    toc_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), CHINESE_FONT),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # ==================== Section 1: Overview ====================
    story.append(Paragraph("1. 功能概述", styles['ChineseHeading']))
    story.append(Spacer(1, 0.2*inch))

    story.append(Paragraph(
        "MarketBrew 提供两种核心的市场分析日报服务，帮助投资者及时了解市场动态：",
        styles['ChineseBody']
    ))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(
        "官方网站：<font color='#059669'><u><a href='https://themarketbrew.com'>themarketbrew.com</a></u></font>",
        styles['ChineseBody']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Comparison table
    comparison_data = [
        ["对比项", "标准化日报", "专属日报"],
        ["英文名称", "Daily Report", "Personal Digest"],
        ["内容类型", "统一内容", "个性化内容"],
        ["是否需要登录", "否", "是"],
        ["自定义关注", "否", "是 (Watchlist)"],
        ["发送时间", "每工作日 6:00 PM ET", "每工作日 6:00 PM ET"],
        ["订阅页面", "/today", "/for-you"],
    ]

    comparison_table = Table(comparison_data, colWidths=[1.8*inch, 1.8*inch, 1.8*inch])
    comparison_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), CHINESE_FONT),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BACKGROUND', (0, 0), (-1, 0), EMERALD),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0fdf4')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(comparison_table)
    story.append(PageBreak())

    # ==================== Section 2: Daily Report ====================
    story.append(Paragraph("2. 标准化日报 (Daily Report)", styles['ChineseHeading']))
    story.append(Spacer(1, 0.2*inch))

    story.append(Paragraph("2.1 功能简介", styles['ChineseSubheading']))
    story.append(Paragraph(
        "标准化日报是面向所有订阅者的统一内容日报，由 AI 自动生成当日的市场分析报告。内容涵盖主要指数表现、市场叙事、关键信号、重要新闻和未来事件等。",
        styles['ChineseBody']
    ))
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph("2.2 主要内容", styles['ChineseSubheading']))
    content_items = [
        "Market Overview - 主要指数（S&P 500、Nasdaq、10Y Treasury、VIX、Gold、US Dollar）",
        "Market Narrative - 当日市场主导逻辑和叙事",
        "Key Signals - 关键宏观信号和指标分析",
        "News - 重要新闻头条和简报",
        "Upcoming Events - 未来一周关键事件日历",
        "Outlook - 市场展望和投资思考",
    ]
    for item in content_items:
        story.append(Paragraph(f"  * {item}", styles['ChineseListItem']))

    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("2.3 页面截图", styles['ChineseSubheading']))

    if os.path.exists(screenshots.get('today', '')):
        img = Image(screenshots['today'], width=5.5*inch, height=3.7*inch)
        story.append(img)
        story.append(Paragraph("标准化日报页面 (/today)", styles['ChineseNote']))

    story.append(PageBreak())

    # ==================== Section 3: Personal Digest ====================
    story.append(Paragraph("3. 专属日报 (Personal Digest)", styles['ChineseHeading']))
    story.append(Spacer(1, 0.2*inch))

    story.append(Paragraph("3.1 功能简介", styles['ChineseSubheading']))
    story.append(Paragraph(
        "专属日报是根据用户自定义的关注列表（Watchlist）个性化生成的市场分析报告。每位用户收到的内容都是针对其关注的股票量身定制的，包括股票分析、相关新闻和事件。",
        styles['ChineseBody']
    ))
    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph("3.2 主要内容", styles['ChineseSubheading']))
    digest_items = [
        "Watchlist Overview - 关注股票的价格、涨跌幅和快速分析",
        "Headlines - 与关注股票相关的重要新闻深度分析",
        "More News - 更多相关新闻简报",
        "Key Events - 与关注股票相关的未来事件",
        "Summary - 整体市场对你持仓的影响总结",
    ]
    for item in digest_items:
        story.append(Paragraph(f"  * {item}", styles['ChineseListItem']))

    story.append(Spacer(1, 0.1*inch))

    story.append(Paragraph("3.3 如何设置关注列表", styles['ChineseSubheading']))
    watchlist_steps = [
        "1. 登录账户后访问 For You 页面",
        "2. 使用搜索框搜索股票（如 AAPL、Apple）",
        "3. 或点击 Quick Add 快速添加预设组合（科技七巨头、芯片股、中概股、金融股）",
        "4. 点击股票卡片右上角的 X 可移除关注",
        "5. 点击 Generate 按钮即时生成个性化报告",
    ]
    for step in watchlist_steps:
        story.append(Paragraph(f"  {step}", styles['ChineseListItem']))

    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("3.4 页面截图", styles['ChineseSubheading']))

    if os.path.exists(screenshots.get('foryou', '')):
        img = Image(screenshots['foryou'], width=5.5*inch, height=3.7*inch)
        story.append(img)
        story.append(Paragraph("专属日报页面 (/for-you)", styles['ChineseNote']))

    story.append(PageBreak())

    # ==================== Section 4: Send Time ====================
    story.append(Paragraph("4. 发送时间", styles['ChineseHeading']))
    story.append(Spacer(1, 0.2*inch))

    story.append(Paragraph(
        "两种日报的发送时间相同，均为美股收盘后自动发送：",
        styles['ChineseBody']
    ))
    story.append(Spacer(1, 0.2*inch))

    time_data = [
        ["时区", "发送时间"],
        ["美东时间 (ET)", "每工作日 6:00 PM"],
        ["太平洋时间 (PT)", "每工作日 3:00 PM"],
        ["北京时间 (CST)", "每工作日 7:00 AM (次日)"],
        ["UTC", "每工作日 23:00"],
    ]

    time_table = Table(time_data, colWidths=[2.5*inch, 2.5*inch])
    time_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), CHINESE_FONT),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BACKGROUND', (0, 0), (-1, 0), EMERALD),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(time_table)
    story.append(Spacer(1, 0.3*inch))

    story.append(Paragraph(
        "注意：日报仅在美股交易日（周一至周五）发送，美国法定假日不发送。",
        styles['ChineseBody']
    ))
    story.append(PageBreak())

    # ==================== Section 5: Subscribe/Unsubscribe ====================
    story.append(Paragraph("5. 订阅与取消订阅", styles['ChineseHeading']))
    story.append(Spacer(1, 0.2*inch))

    # Subscribe to Daily Report
    story.append(Paragraph("5.1 订阅标准化日报", styles['ChineseSubheading']))
    daily_subscribe_steps = [
        "1. 访问 MarketBrew 官网的 Today 页面",
        "2. 点击页面右上角的绿色 Subscribe 按钮",
        "3. 如果未登录，系统会提示先登录",
        "4. 订阅成功后，按钮变为 Subscribed 状态",
    ]
    for step in daily_subscribe_steps:
        story.append(Paragraph(f"  {step}", styles['ChineseListItem']))

    story.append(Spacer(1, 0.15*inch))

    # Subscribe to Personal Digest
    story.append(Paragraph("5.2 订阅专属日报", styles['ChineseSubheading']))
    digest_subscribe_steps = [
        "1. 登录账户",
        "2. 访问 For You 页面",
        "3. 首先设置你的关注列表（添加至少一只股票）",
        "4. 点击 Subscribe 按钮",
        "5. 订阅成功后，系统会根据你的关注列表每日发送个性化报告",
    ]
    for step in digest_subscribe_steps:
        story.append(Paragraph(f"  {step}", styles['ChineseListItem']))

    story.append(Spacer(1, 0.15*inch))

    # Unsubscribe
    story.append(Paragraph("5.3 取消订阅", styles['ChineseSubheading']))
    story.append(Paragraph("方法一：通过页面取消", styles['ChineseBody']))
    unsubscribe_method1 = [
        "  * 标准化日报：在 Today 页面点击 Subscribed 按钮（悬停显示 Unsubscribe）",
        "  * 专属日报：在 For You 页面点击 Subscribed 按钮",
    ]
    for item in unsubscribe_method1:
        story.append(Paragraph(item, styles['ChineseListItem']))

    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph("方法二：通过邮件取消", styles['ChineseBody']))
    unsubscribe_method2 = [
        "  * 点击每封邮件底部的 Unsubscribe 链接",
        "  * 系统会跳转到取消订阅页面",
        "  * 输入邮箱地址确认取消",
    ]
    for item in unsubscribe_method2:
        story.append(Paragraph(item, styles['ChineseListItem']))

    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("5.4 取消订阅页面", styles['ChineseSubheading']))

    if os.path.exists(screenshots.get('unsubscribe', '')):
        img = Image(screenshots['unsubscribe'], width=5.5*inch, height=3.2*inch)
        story.append(img)
        story.append(Paragraph("取消订阅页面 (/unsubscribe)", styles['ChineseNote']))

    # Build PDF
    doc.build(story)
    print(f"PDF generated: {OUTPUT_PDF}")
    return OUTPUT_PDF


async def main():
    """Main function."""
    print("=" * 50)
    print("MarketBrew Beta Guide PDF Generator")
    print("=" * 50)

    # Capture screenshots
    print("\n[Step 1] Capturing screenshots...")
    screenshots = await capture_screenshots()

    # Generate PDF
    print("\n[Step 2] Generating PDF...")
    output = generate_pdf(screenshots)

    print("\n" + "=" * 50)
    print(f"Done! PDF saved to: {output}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
