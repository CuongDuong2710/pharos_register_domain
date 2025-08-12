1. Vào thư mục pharos_register_domain, cài đặt thư viện cần thiết

```
npm install

npm install -g typescript ts-node

npm install ethers dotenv
```

2. Đổi tên file `.env.example` thành `.env`

Copy private key các ví theo mẫu pk1,pk2 (liền mạch, không khoảng trắng, không enter xuống dòng)

> Lưu ý: chỉ để file .env dưới local, tuyệt đối không push lên github, X hay Telegram.

3. Run code

```
ts-node app/register_domains.ts

```

- Bước 1. Chọn tên miền ngẫu nhiên
- Bước 2. Commit và chờ 65s
- Bước 3. Đăng ký tên miền
