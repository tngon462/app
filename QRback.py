# monitor_firebase.py
import asyncio, aiohttp, time, re
from typing import Dict

# Selenium
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Firebase Admin
import firebase_admin
from firebase_admin import credentials, db

# ====== CONFIG ======
LINKS_JSON_URL = "https://tngon462.github.io/QR/links.json"  # GIỮ NGUYÊN LINK

SERVICE_ACCOUNT_JSON = r"C:\khoidong\service-account.json"
DATABASE_URL = "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app"

CHECK_INTERVAL = 5       # giây, kiểm tra DOM
REOPEN_DELAY = 3         # giây, mở lại link sau khi hết phiên

EXPIRED_PATTERNS = [
    "Your QR code has expired. Please scan the QR code again.",
    "QR đã hết hạn",
    "QR code đã hết hạn",
    "phiên làm việc đã kết thúc",
    "phiên đã hết hiệu lực",
    "QR đã hết hạn sử dụng vui lòng quét lại mã QR",
    "QRコードの有効期限が切れました",
    "您的二维码已过期",
    "고객님의 QR 코드가 만료되었습니다",
]
EXPIRED_REGEX = re.compile("|".join(re.escape(p) for p in EXPIRED_PATTERNS), re.IGNORECASE)
# ====== END CONFIG ======


# ---------- Firebase ----------
def fb_init():
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_JSON)
        firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})

def push_expired(ban: int):
    """Ghi tín hiệu 'expired' lên RTDB: signals/<ban>"""
    ref = db.reference(f"signals/{ban}")
    ref.set({"status": "expired", "ts": int(time.time())})
# ---------- End Firebase ----------


# ---------- Selenium ----------
def make_driver():
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1280,800")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    try:
        return webdriver.Chrome(options=opts)
    except Exception:
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=opts)
# ---------- End Selenium ----------


# ---------- Fetch Links ----------
async def fetch_links() -> Dict[int, str]:
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(LINKS_JSON_URL, timeout=20) as r:
                r.raise_for_status()
                data = await r.json()

                links: Dict[int, str] = {}
                updated_at = data.get("updated_at")
                raw_links = data.get("links", {})

                for k, v in raw_links.items():
                    if k.isdigit():
                        links[int(k)] = v

                print(f"[LINKS] Loaded {len(links)} tables")
                if updated_at:
                    print(f"[LINKS] Updated at: {updated_at}")

                return links
    except Exception as e:
        print(f"Lỗi khi fetch links.json: {e}")
        return {}
# ---------- End Fetch Links ----------


async def open_all_tables(driver, links: Dict[int, str]):
    """Mỗi bàn mở ở 1 tab"""
    handles = {}
    first = True
    for ban, url in links.items():
        if first:
            driver.get(url)
            handles[ban] = driver.current_window_handle
            first = False
        else:
            driver.execute_script("window.open('about:blank','_blank');")
            driver.switch_to.window(driver.window_handles[-1])
            driver.get(url)
            handles[ban] = driver.current_window_handle
        await asyncio.sleep(0.2)
    return handles


async def monitor_loop(driver, links: Dict[int, str], handles: Dict[int, str]):
    while True:
        for ban, handle in list(handles.items()):
            try:
                driver.switch_to.window(handle)
            except Exception:
                driver.execute_script("window.open('about:blank','_blank');")
                new_h = driver.window_handles[-1]
                handles[ban] = new_h
                driver.switch_to.window(new_h)
                driver.get(links[ban])
                await asyncio.sleep(1)
                continue

            try:
                html = driver.page_source or ""
            except Exception:
                html = ""

            if EXPIRED_REGEX.search(html):
                print(f"[EXPIRED] Bàn {ban} -> gửi tín hiệu Firebase, mở lại link")
                push_expired(ban)
                await asyncio.sleep(REOPEN_DELAY)
                try:
                    driver.get(links[ban])
                except Exception:
                    driver.execute_script("window.open('about:blank','_blank');")
                    new_h = driver.window_handles[-1]
                    handles[ban] = new_h
                    driver.switch_to.window(new_h)
                    driver.get(links[ban])

        await asyncio.sleep(CHECK_INTERVAL)


async def main():
    fb_init()
    links = await fetch_links()
    if not links:
        print("Không có links nào để theo dõi. Thoát...")
        return

    loop = asyncio.get_running_loop()
    driver = await loop.run_in_executor(None, make_driver)

    handles = await open_all_tables(driver, links)
    try:
        await monitor_loop(driver, links, handles)
    finally:
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
