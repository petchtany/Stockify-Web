import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"; 
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses"; 

const region = "ap-southeast-1"; 
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region }); 
const ses = new SESClient({ region }); 

// 🔴 อย่าลืมเปลี่ยนชื่อถัง S3 เป็นของคุณดาวนะครับ
const IMAGE_BUCKET_NAME = "stockify-images-12345"; 
const MY_EMAIL = "pongsakorn135600@gmail.com"; 

async function sendAlert(sku, name, stock) {
    console.log(`🚨 สต็อก ${name} ต่ำกว่ากำหนด เหลือ ${stock} กำลังส่งเมลหา ${MY_EMAIL}...`);
    const params = {
        Source: MY_EMAIL,
        Destination: { ToAddresses: [MY_EMAIL] },
        Message: {
            Subject: { Data: `⚠️ แจ้งเตือน: สินค้า ${name} ใกล้หมดคลัง!` },
            Body: { Html: { Data: `<h3>Stockify Alert</h3><p>สินค้า: <b>${name}</b> (SKU: ${sku})<br>เหลือเพียง <b>${stock}</b> ชิ้น กรุณาเติมของด่วนครับ!</p>` } }
        }
    };
    try { 
        await ses.send(new SendEmailCommand(params)); 
        console.log("✅ ส่งอีเมลสำเร็จ!");
    } catch(e) { console.error("❌ SES Error:", e); }
}

export const handler = async (event) => {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" };
    try {
        const method = event.requestContext?.http?.method || event.httpMethod;
        if (method === "OPTIONS") return { statusCode: 200, headers, body: "" };
        const body = event.body ? JSON.parse(event.body) : {};
        const queryParams = event.queryStringParameters || {};

        if (method === "GET") {
            const tableName = queryParams.table === "history" ? "Stockify-History" : "Stockify-Products";
            const response = await dynamo.send(new ScanCommand({ TableName: tableName }));
            return { statusCode: 200, headers, body: JSON.stringify(response.Items || []) };
        } 
        
        else if (method === "POST" || method === "PUT") {
            if (body.action === "TRANSACTION") {
                await dynamo.send(new UpdateCommand({ TableName: "Stockify-Products", Key: { sku: body.sku }, UpdateExpression: "set stock = :s", ExpressionAttributeValues: { ":s": Number(body.newStock) } }));
                await dynamo.send(new PutCommand({ TableName: "Stockify-History", Item: { txId: Date.now().toString(), sku: body.sku, type: body.type, qty: body.qty, timestamp: new Date().toISOString(), note: body.note } }));
                
                if (body.type === "OUT") {
                    const product = await dynamo.send(new ScanCommand({ TableName: "Stockify-Products", FilterExpression: "sku = :s", ExpressionAttributeValues: { ":s": body.sku } }));
                    const pInfo = product.Items[0];
                    if (pInfo && Number(body.newStock) <= (Number(pInfo.minStock) || 5)) {
                        await sendAlert(body.sku, pInfo.name, body.newStock);
                    }
                }
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Success" }) };
            } 
            else {
                let finalImageUrl = body.imageUrl || ""; 
                if (body.imageBase64 && body.imageBase64.includes("base64,")) {
                    const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, ""); 
                    const buffer = Buffer.from(base64Data, 'base64');
                    const fileExt = body.imageBase64.split(';')[0].split('/')[1] || "png"; 
                    const fileName = `img-${body.sku}-${Date.now()}.${fileExt}`; 
                    await s3.send(new PutObjectCommand({ Bucket: IMAGE_BUCKET_NAME, Key: fileName, Body: buffer, ContentType: `image/${fileExt}` }));
                    finalImageUrl = `https://${IMAGE_BUCKET_NAME}.s3.${region}.amazonaws.com/${fileName}`;
                }
                const itemToSave = { ...body, imageUrl: finalImageUrl };
                delete itemToSave.imageBase64; 
                await dynamo.send(new PutCommand({ TableName: "Stockify-Products", Item: itemToSave }));
                return { statusCode: 200, headers, body: JSON.stringify({ message: "Saved" }) };
            }
        }
        else if (method === "DELETE") {
            await dynamo.send(new DeleteCommand({ TableName: "Stockify-Products", Key: { sku: body.sku } }));
            return { statusCode: 200, headers, body: JSON.stringify({ message: "Deleted" }) };
        }
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
};