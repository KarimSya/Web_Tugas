# RuangTugas — Pengingat Tugas Kuliah

Aplikasi web responsif untuk mencatat tugas kuliah, memantau deadline, dan menerima pengingat push pada H-1 serta 3 jam sebelum deadline.

## Teknologi

- **Frontend:** HTML, Bootstrap 5, CSS responsif khusus, dan JavaScript; dapat dipasang sebagai PWA.
- **Backend:** Node.js 20+, Express, JWT di cookie `HttpOnly`, bcrypt, dan validasi input.
- **Database:** PostgreSQL.
- **Push:** Web Push API, Service Worker, dan VAPID.
- **Penjadwalan:** `node-cron` berjalan setiap menit di proses aplikasi.

## Struktur proyek

```text
task-reminder/
├── db/
│   └── schema.sql
├── public/
│   ├── app.js
│   ├── icon.svg
│   ├── index.html
│   ├── manifest.json
│   ├── styles.css
│   └── sw.js
├── server/
│   ├── auth-middleware.js
│   ├── auth.js
│   ├── courses.js
│   ├── db.js
│   ├── push.js
│   ├── reminders.js
│   └── tasks.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

Setiap akun mendapat sembilan mata kuliah awal. `courses` dimiliki pengguna sehingga nama dan warna kategori tidak dibagikan dengan akun lain. `push_subscription` menyimpan daftar perangkat berlangganan; tabel `reminder_deliveries` mencegah pengiriman duplikat untuk pengingat yang sama.

## Menjalankan lokal

Persyaratan: Node.js 20+, npm, dan PostgreSQL 14+.

1. Buat database PostgreSQL, misalnya `task_reminder`.
2. Terapkan skema:

   ```sh
   psql "postgresql://postgres:password@localhost:5432/task_reminder" -f db/schema.sql
   ```

3. Salin `.env.example` menjadi `.env`, lalu atur `DATABASE_URL` dan `JWT_SECRET`. Buat secret JWT acak minimal 32 karakter. Contoh PowerShell:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

4. Pasang dependensi dan mulai server:

   ```sh
   npm install
   npm start
   ```

5. Buka `http://localhost:3000`. `localhost` dianggap secure context oleh browser modern sehingga Service Worker dan notifikasi dapat diuji secara lokal.

## Mengaktifkan Web Push

1. Buat pasangan kunci VAPID:

   ```sh
   npx web-push generate-vapid-keys
   ```

2. Masukkan `Public Key` ke `VAPID_PUBLIC_KEY`, `Private Key` ke `VAPID_PRIVATE_KEY`, dan alamat kontak valid ke `VAPID_SUBJECT` di `.env`. Jangan publikasikan private key.
3. Restart server, masuk ke aplikasi, lalu tekan **Aktifkan notifikasi** dan izinkan notifikasi di browser. Langkah izin harus dimulai dari klik pengguna.
4. Browser membuat subscription unik per perangkat/browser dan server menyimpannya untuk pengguna tersebut. Tombol notifikasi yang aktif dapat ditekan lagi untuk menonaktifkan perangkat tersebut. Pengingat dijadwalkan kira-kira H-24 jam dan H-3 jam; browser tujuan harus mendukung Web Push. Tugas yang sudah selesai tidak dikirim pengingat.

Push membutuhkan HTTPS pada deployment publik (localhost dikecualikan). Pengguna juga perlu mengizinkan notifikasi untuk situs tersebut; pada iPhone/iPad, tambahkan situs ke Home Screen dan gunakan aplikasi terpasang dengan iOS/iPadOS yang mendukung Web Push.

## API

Semua endpoint kecuali register/login/logout memerlukan session cookie.

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/auth/register` | Daftar `{ name, email, password }`; membuat 9 mata kuliah default |
| POST | `/api/auth/login` | Masuk `{ email, password }` |
| POST | `/api/auth/logout` | Menghapus cookie sesi |
| GET | `/api/auth/me` | Pengguna dalam sesi |
| GET/POST/PATCH/DELETE | `/api/courses` | Daftar, tambah, ubah, dan hapus kategori milik pengguna |
| GET/POST | `/api/tasks` | Daftar (filter `courseId`, `status=active\|completed`, `q`) dan tambah tugas |
| PATCH/DELETE | `/api/tasks/:id` | Ubah tugas atau hapus; `PATCH` menerima `title`, `description`, `courseId`, `deadline`, `priority`, `isCompleted` |
| GET | `/api/push/vapid-public-key` | Kunci publik untuk browser |
| POST/DELETE | `/api/push/subscription` | Simpan/hapus subscription perangkat |

Prioritas tugas: `low`, `medium`, atau `high`. Deadline dikirim sebagai timestamp ISO 8601. Data tugas selalu dibatasi berdasarkan pemilik sesi, termasuk saat kategori diperbarui.

## Deploy

1. Siapkan PostgreSQL terkelola dan jalankan `db/schema.sql` terhadap database tersebut. Aktifkan SSL database sesuai penyedia; set `DATABASE_SSL=true` bila koneksi membutuhkan TLS dengan sertifikat penyedia.
2. Deploy folder proyek ke host Node.js (misalnya Render, Railway, Fly.io, atau VPS). Jalankan `npm install` saat build dan `npm start` sebagai start command.
3. Atur environment variables `NODE_ENV=production`, `PORT` (jika diperlukan host), `DATABASE_URL`, `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT`. Gunakan secret kuat dan jangan commit `.env`.
4. Pasang domain dengan HTTPS. Pastikan reverse proxy meneruskan koneksi HTTPS dan cookie secure.
5. Proses web dan worker pengingat berjalan dalam proses server yang sama. Jalankan satu replica aplikasi untuk menghindari scheduler ganda; constraint unik mengurangi duplikasi, tetapi deployment multi-replica sebaiknya memindahkan worker ke proses tunggal terpisah.
6. Uji register, tambah tugas, penyimpanan subscription, dan pengiriman push dengan deadline uji yang sesuai. Pastikan proses server tetap aktif agar scheduler setiap menit dapat berjalan.

## Catatan produksi

- Password di-hash dengan bcrypt dan sesi JWT disimpan pada cookie `HttpOnly`, `SameSite=Lax`, serta `Secure` pada mode produksi.
- Endpoint autentikasi dibatasi rate limit. Semua query menggunakan parameter SQL.
- Web Push hanya dapat dikirim jika proses worker hidup dan konfigurasi VAPID valid. Periksa log server bila penyedia push menolak pengiriman.
- Untuk skala multi-instance atau kebutuhan retry terjamin, jalankan scheduler terpisah dengan mekanisme antrean/claim terdistribusi.
