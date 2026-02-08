# Cấu hình Firebase cho T-NGON

Các giá trị sau cần được cấu hình trong Firebase Realtime Database tại path `config/`:

## config/secretPassword
- **Mục đích:** Mật khẩu nút bí mật trên iPad (giữ 3s → nhập mật khẩu → về màn chọn bàn)
- **Kiểu:** Chuỗi (string)
- **Ví dụ:** `"6868"`
- **Fallback:** Nếu không có hoặc offline, dùng `"6868"`

## config/adminPassword
- **Mục đích:** Mật khẩu đăng nhập Admin
- **Kiểu:** Chuỗi (string)
- **Ví dụ:** `"your-secure-password"`
- **Lưu ý:** Chỉ có thể truy cập admin sau khi nhập đúng mật khẩu (lưu trong session)

## Cách thêm trong Firebase Console

1. Mở [Firebase Console](https://console.firebase.google.com)
2. Chọn project `tngon-b37d6`
3. Realtime Database → Data
4. Thêm node `config`:
   ```
   config
   ├── secretPassword: "6868"
   └── adminPassword: "your-admin-password"
   ```

## Bảo mật (Firebase Rules)

Để hạn chế ai đọc được config, có thể thêm rules (tùy chọn):

```json
{
  "rules": {
    "config": {
      ".read": "auth != null",
      ".write": "auth != null && auth.token.admin == true"
    }
  }
}
```
