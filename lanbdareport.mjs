import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const region = "ap-southeast-1";
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const ses = new SESClient({ region });

// 🔴 อีเมลของคุณดาว
const MY_EMAIL = "pongsakorn135600@gmail.com";

export const handler = async (event) => {
    try {
        // 1. แอบเข้าไปดูสต็อกใน DynamoDB
        const response = await dynamo.send(new ScanCommand({ TableName: "Stockify-Products" }));
        const products = response.Items || [];

        // 2. เริ่มคำนวณยอด
        let totalValue = 0;
        let lowStockItems = [];

        products.forEach(p => {
            const stock = Number(p.stock || 0);
            const price = Number(p.price || 0);
            const minStock = Number(p.minStock || 5);

            totalValue += (stock * price); // คำนวณมูลค่ารวม

            // ถ้าของเหลือน้อยกว่าจุดสั่งซื้อ ให้จดชื่อไว้
            if (stock <= minStock) {
                lowStockItems.push(`<li><b>${p.name}</b> (SKU: ${p.sku}) - เหลือ <b>${stock}</b> ชิ้น</li>`);
            }
        });

        // 3. จัดหน้าตา Email ให้ดูเป็นมืออาชีพ
        const htmlBody = `
            <div style="font-family: sans-serif; color: #333;">
                <h2>📊 สรุปยอดคลังสินค้าประจำวัน (Stockify)</h2>
                <p>สวัสดีครับเถ้าแก่ นี่คือรายงานสรุปสต็อกสินค้าอัปเดตล่าสุดครับ:</p>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0;">📦 ภาพรวมธุรกิจ</h3>
                    <ul style="font-size: 16px;">
                        <li>สินค้าทั้งหมดในระบบ: <b>${products.length}</b> รายการ</li>
                        <li>มูลค่าสต็อกรวม: <b>฿${totalValue.toLocaleString()}</b> บาท</li>
                    </ul>
                </div>
                
                <h3 style="color: ${lowStockItems.length > 0 ? '#d9534f' : '#5cb85c'};">
                    ⚠️ สินค้าที่ต้องเติมสต็อกด่วน (${lowStockItems.length} รายการ)
                </h3>
                <ul>
                    ${lowStockItems.length > 0 ? lowStockItems.join('') : "<li>✅ สต็อกแน่นๆ ปลอดภัยทุกรายการครับ!</li>"}
                </ul>
                <hr style="border: 1px solid #eee; margin-top: 30px;" />
                <p style="font-size: 12px; color: #999;">ส่งอัตโนมัติจาก AWS Lambda - Stockify Report</p>
            </div>
        `;

        // 4. สั่งส่งอีเมล
        const params = {
            Source: MY_EMAIL,
            Destination: { ToAddresses: [MY_EMAIL] },
            Message: {
                Subject: { Data: `📊 Stockify Daily Report - ${new Date().toLocaleDateString('th-TH')}` },
                Body: { Html: { Data: htmlBody } }
            }
        };

        await ses.send(new SendEmailCommand(params));
        console.log("✅ ส่ง Report สำเร็จ!");
        return { statusCode: 200, body: "Report sent!" };

    } catch (error) {
        console.error("❌ Error:", error);
        return { statusCode: 500, body: "Error sending report" };
    }
};