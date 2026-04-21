// 1. นำค่าจาก AWS Console มาใส่ตรงนี้
const poolData = {
    UserPoolId: 'ap-southeast-1_rsYwrROD2', // ใส่ User Pool ID ของคุณ
    ClientId: '4ft97t4m13vm22oen4nt0gbito'   // ใส่ Client ID ของคุณ
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// 2. ฟังก์ชันจัดการเมื่อกดปุ่ม Login
document.getElementById('login-form').addEventListener('submit', function(event) {
    event.preventDefault(); // ป้องกันเว็บโหลดใหม่
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');
    const loginBtn = document.getElementById('login-btn');

    loginBtn.innerText = "Signing in...";
    errorMsg.style.display = "none";

    // จัดเตรียมข้อมูลผู้ใช้
    const authenticationData = {
        Username: email,
        Password: password,
    };
    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

    const userData = {
        Username: email,
        Pool: userPool
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

   // 3. ส่งข้อมูลไปตรวจสอบกับ AWS Cognito
    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function (result) {
            // ล็อกอินสำเร็จ: เก็บ Token แล้วเตะเข้าหน้า Dashboard
            const accessToken = result.getAccessToken().getJwtToken();
            localStorage.setItem('stockify_token', accessToken);
            window.location.href = "index.html";
        },
        onFailure: function(err) {
            // ล็อกอินไม่ผ่าน
            loginBtn.innerText = "Sign In";
            errorMsg.innerText = err.message || "Invalid email or password.";
            errorMsg.style.display = "block";
        },
        // 👇👇 เพิ่มส่วนนี้เข้าไป เพื่อรองรับการตั้งรหัสใหม่ครั้งแรก 👇👇
        newPasswordRequired: function(userAttributes, requiredAttributes) {
            const newPassword = prompt("🔒 AWS บังคับให้ตั้งรหัสผ่านใหม่สำหรับการล็อกอินครั้งแรก:\n(รหัสต้องมี 8 ตัวอักษร, พิมพ์ใหญ่, พิมพ์เล็ก, ตัวเลข, และอักขระพิเศษ)");
            
            if (newPassword) {
                loginBtn.innerText = "Updating password...";
                // ส่งรหัสผ่านใหม่กลับไปให้ AWS อัปเดต
                cognitoUser.completeNewPasswordChallenge(newPassword, {}, this);
            } else {
                loginBtn.innerText = "Sign In";
                alert("ต้องตั้งรหัสผ่านใหม่ถึงจะเข้าใช้งานได้ครับ");
            }
        }
    });
});