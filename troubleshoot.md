# Troubleshooting Guide - Contact Form Deployment

This document contains all errors encountered during deployment and their solutions.

---

## **Error 1: Git Command Not Found on EC2**

### **Problem:**

```bash
[ec2-user@ip-10-0-2-215 ~]$ git clone git@github.com:Godwin-svg/contact-form-app.git
-bash: git: command not found
```

### **Cause:**

Git is not installed by default on Amazon Linux 2023.

### **Solution:**

```bash
# Install git using dnf (AL2023 package manager)
sudo dnf install git -y

# Verify installation
git --version
```

**Result:** ✅ Git installed successfully

---

## **Error 2: SSH Host Authenticity Verification**

### **Problem:**

```bash
The authenticity of host 'github.com (140.82.114.4)' can't be established.
ED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.
Are you sure you want to continue connecting (yes/no/[fingerprint])? y
Please type 'yes', 'no' or the fingerprint: y
Please type 'yes', 'no' or the fingerprint:
```

### **Cause:**

First-time SSH connection to GitHub requires explicit confirmation. SSH requires the full word "yes", not just "y".

### **Solution:**

```bash
# Type the complete word
yes
```

**Key Learning:** SSH security prompts require full word responses, not abbreviations.

**Result:** ✅ GitHub host key added to known_hosts

---

## **Error 3: GitHub SSH Permission Denied**

### **Problem:**

```bash
[ec2-user@ip-10-0-2-215 ~]$ git clone git@github.com:Godwin-svg/contact-form-app.git
Cloning into 'contact-form-app'...
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.
```

### **Cause:**

EC2 instance doesn't have SSH keys configured for GitHub authentication.

### **Solution:**

Use HTTPS instead of SSH for cloning:

```bash
# Clone using HTTPS (no SSH keys needed)
git clone https://github.com/Godwin-svg/contact-form-app.git
```

**Alternative Solution (if you prefer SSH):**

```bash
# Generate SSH key on EC2
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings → SSH and GPG keys → New SSH key
```

**Result:** ✅ Repository cloned successfully using HTTPS

---

## **Error 4: IAM Permission Denied - ssm:GetParameters**

### **Problem:**

```bash
> contact-form-aws-rds@1.0.0 start
> node server.js

Failed to start server: User: arn:aws:sts::058264237826:assumed-role/contact-form-school-role/i-06880b9c8deb2d224 is not authorized to perform: ssm:GetParameters on resource: arn:aws:ssm:us-east-1:058264237826:parameter/contact-form/S3_BUCKET_NAME because no identity-based policy allows the ssm:GetParameters action
```

### **Cause:**

The IAM role `contact-form-school-role` attached to the EC2 instance did not have permissions to:

- Read from Parameter Store (`ssm:GetParameters`)
- Read from Secrets Manager (`secretsmanager:GetSecretValue`)
- Upload to S3 (`s3:PutObject`)

### **Root Cause Analysis:**

```
EC2 Instance (i-06880b9c8deb2d224)
    ↓ assumes
IAM Role (contact-form-school-role)
    ↓ has NO policies attached (or insufficient policies)
    ↓ attempts to call
Parameter Store API
    ↓ IAM checks permissions
    ❌ DENY (no matching ALLOW statement found)
```

### **📖 How to Read This Error (Log Analysis Skills):**

**1. Error Message Anatomy:**

```
Failed to start server: User: arn:aws:sts::058264237826:assumed-role/contact-form-school-role/i-06880b9c8deb2d224
is not authorized to perform: ssm:GetParameters
on resource: arn:aws:ssm:us-east-1:058264237826:parameter/contact-form/S3_BUCKET_NAME
because no identity-based policy allows the ssm:GetParameters action
```

**Breaking it down:**

- **"User: arn:aws:sts::..."** → WHO is making the request
  - `sts::` = Security Token Service (temporary credentials)
  - `assumed-role/contact-form-school-role` = IAM role name
  - `/i-06880b9c8deb2d224` = EC2 instance ID
- **"is not authorized to perform: ssm:GetParameters"** → WHAT action failed
  - Format: `service:Action`
  - `ssm` = AWS Systems Manager service
  - `GetParameters` = API call being attempted
- **"on resource: arn:aws:ssm:..."** → WHERE (what resource)
  - Shows exact parameter path being accessed
  - Includes region and account ID
- **"because no identity-based policy allows..."** → WHY it failed
  - No ALLOW statement found in IAM policies
  - AWS default = implicit DENY

**2. Pattern Recognition:**

AWS IAM errors follow this template:

```
[WHO] is not authorized to perform: [ACTION] on resource: [RESOURCE] because [REASON]
```

**3. Debugging Decision Tree:**

```
IAM Error?
  ↓
1. Check WHO → Is correct role attached to EC2?
  ↓
2. Check ACTION → What permission is needed?
  ↓
3. Check RESOURCE → Does policy resource pattern match?
  ↓
4. Check IAM Console → Does role have this permission?
  ↓
5. Add missing permission → Restart app
```

**4. Common IAM Error Variations:**

| Error Type                        | Meaning                   | Solution                   |
| --------------------------------- | ------------------------- | -------------------------- |
| `no identity-based policy allows` | No ALLOW found (our case) | Add permission to role     |
| `explicit deny`                   | Policy explicitly blocks  | Remove DENY statement      |
| `access denied`                   | Generic permission issue  | Check all policies         |
| `invalid resource`                | ARN doesn't match pattern | Fix resource ARN in policy |

**5. Pro Tips:**

- ✅ **Always read the FULL error** - Don't stop at "Access Denied"
- ✅ **Copy the ACTION** (`ssm:GetParameters`) - You'll need it for the policy
- ✅ **Note the RESOURCE ARN** - Use it to scope permissions correctly
- ✅ **Check CloudTrail** (optional) - See the full API call details

### **Solution:**

1. **Go to AWS IAM Console** → **Roles** → Search for `contact-form-school-role`

2. **Add inline policy** with the following JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VisualEditor0",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-contact-form-uploads-bucket/*"
    },
    {
      "Sid": "VisualEditor1",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:058264237826:secret:contact-form-secret1-HUOxen",
        "arn:aws:ssm:us-east-1:058264237826:parameter/contact-form/*"
      ]
    }
  ]
}
```

**⚠️ Important:** Fix the common typo - use single slash in parameter path:

- ❌ Wrong: `parameter//contact-form/*` (double slash)
- ✅ Correct: `parameter/contact-form/*` (single slash)

3. **Name the policy:** `contact-form-permissions`

4. **Save and test:**

```bash
# On EC2, restart the application
npm start

# Should see:
# Server running on http://localhost:3000
```

### **Verification:**

```bash
# Test health check
curl http://localhost:3000/api/health

# Expected response:
{"ok":true,"message":"Service is healthy"}
```

**Result:** ✅ Application started successfully with database connectivity

---

## **Error 5: Mixed Content - HTTPS Page Loading HTTP Resource**

### **Problem:**

```
Mixed Content: The page at 'https://main.dsd94dfus4op8.amplifyapp.com/' was loaded over HTTPS, but requested an insecure resource 'http://contact-form-alb-1982529542.us-east-1.elb.amazonaws.com/api/contact'. This request has been blocked; the content must be served over HTTPS.
```

### **Cause:**

Amplify serves the frontend over HTTPS, but the API endpoint was configured to use HTTP. Modern browsers block mixed content (HTTPS → HTTP) for security.

### **Solution:**

Set up custom domain with SSL certificate for the ALB, then update frontend to use HTTPS:

1. **In AWS Certificate Manager (ACM):**
   - Request SSL certificate for custom domain
   - Validate domain ownership

2. **In ALB:**
   - Add HTTPS (443) listener with the certificate
   - Configure to forward to EC2 target group

3. **In Route 53 (or DNS provider):**
   - Point custom domain to ALB (A record or CNAME)

4. **Update frontend** in `public/index.html`:

   ```javascript
   // Changed from:
   fetch("http://contact-form-alb-1982529542.us-east-1.elb.amazonaws.com/api/contact", ...)

   // To:
   fetch("https://backend-contact-form.godwintechservices.com/api/contact", ...)
   ```

5. **Commit and push:**
   ```bash
   git add public/index.html
   git commit -m "Update API endpoint to custom domain with HTTPS"
   git push
   ```

**Result:** ✅ Custom domain configured: `https://backend-contact-form.godwintechservices.com`

---

## **Error 6: InvalidBucketName - Trailing Space in Parameter Store**

### **Problem:**

```bash
0|contact-form  | Submission error: InvalidBucketName: The specified bucket is not valid.
0|contact-form  |   Code: 'InvalidBucketName',
0|contact-form  |   BucketName: 'my-contact-form-uploads-bucket ',
```

### **📖 How to Read This Error (Log Analysis Skills):**

**1. PM2 Log Format:**

```
0|contact-form  | Submission error: InvalidBucketName: The specified bucket is not valid.
│       │                │                    │
│       │                │                    └─ Error message
│       │                └─ Error name/type
│       └─ Process name (from pm2 start server.js --name contact-form)
└─ Process ID in PM2
```

**2. The Critical Clue:**

```bash
BucketName: 'my-contact-form-uploads-bucket '
                                            ↑
                                    Trailing space!
```

**How to spot it:**

- Look at string values in error objects
- Pay attention to quotes: `'value '`
- The space BEFORE the closing quote is invisible in some terminals
- But it's there in the error output

**3. Stack Trace Analysis (if shown):**

```bash
0|contact-form  |     at AwsRestXmlProtocol.handleError (...)
0|contact-form  |     at AwsRestXmlProtocol.deserializeResponse (...)
0|contact-form  |     at process.processTicksAndRejections (...)
0|contact-form  |     at async /home/ec2-user/contact-form-app/node_modules/@aws-sdk/middleware-sdk-s3/...
```

**Reading the stack trace (bottom to top):**

- **Bottom** = Where execution started (oldest)
- **Top** = Where error was thrown (most recent)
- **Look for your code** - Lines with `/home/ec2-user/contact-form-app/` (not in node_modules)
- **In this case** - All lines are in node_modules = AWS SDK threw the error, not our code

**4. Error Object Anatomy:**

```javascript
{
  '$fault': 'client',              // CLIENT error (your fault, not AWS)
  '$retryable': undefined,         // Can't retry this error
  '$metadata': {
    httpStatusCode: 400,           // HTTP 400 = Bad Request (client error)
    requestId: '6G5TNN8WZC6YW1B4', // AWS request ID (for support tickets)
    attempts: 1,                   // Only tried once (no retries)
    totalRetryDelay: 0             // No retry delay
  },
  Code: 'InvalidBucketName',       // ← THE KEY: Error code
  BucketName: 'my-contact-form-uploads-bucket ', // ← THE CLUE: Value with space
  RequestId: '6G5TNN8WZC6YW1B4'
}
```

**5. Pattern Recognition:**

| Error Code          | Service | Meaning                               | Common Causes                           |
| ------------------- | ------- | ------------------------------------- | --------------------------------------- |
| `InvalidBucketName` | S3      | Bucket name doesn't meet requirements | Trailing space, invalid chars, too long |
| `NoSuchBucket`      | S3      | Bucket doesn't exist                  | Typo, wrong region, not created yet     |
| `AccessDenied`      | S3      | Permission denied                     | Missing `s3:PutObject` permission       |
| `EntityTooLarge`    | S3      | File too large                        | Exceeds size limit                      |

**6. Debugging Strategy:**

```
S3 Error?
  ↓
1. Check error Code → What type of error?
  ↓
2. Look at error details → BucketName, Key, etc.
  ↓
3. Compare to known values → Does it match what you expect?
  ↓
4. Look for invisible characters → Spaces, tabs, newlines
  ↓
5. Check source → Where did this value come from? (Parameter Store in our case)
  ↓
6. Fix at source → Update Parameter Store, restart app
```

**7. Pro Tips:**

- ✅ **$fault: 'client'** = Your mistake (fix your code/config)
- ✅ **$fault: 'server'** = AWS issue (retry or wait)
- ✅ **httpStatusCode: 400-499** = Client error
- ✅ **httpStatusCode: 500-599** = Server error
- ✅ **Copy RequestId** = Include in AWS support tickets
- ✅ **Look at actual values** = Don't assume, verify what's in the error object

### **Cause:**

The Parameter Store value for `/contact-form/S3_BUCKET_NAME` had a trailing space: `my-contact-form-uploads-bucket ` (space at end). S3 bucket names cannot contain trailing spaces.

### **Root Cause:**

Copy-paste error when creating the parameter in AWS Console, or accidental space typed at the end.

### **Solution:**

1. **Fix Parameter Store value:**
   - Go to **AWS Console** → **Systems Manager** → **Parameter Store**
   - Find `/contact-form/S3_BUCKET_NAME`
   - Click **Edit**
   - Remove trailing space (highlight all text to see if space exists)
   - Value should be exactly: `my-contact-form-uploads-bucket` (no space)
   - Click **Save changes**

2. **Restart application on EC2:** (app caches parameter values at startup)

   ```bash
   pm2 restart contact-form
   ```

3. **Test form submission again**

**Key Learning:** Always trim whitespace when entering parameter values. Parameter Store doesn't validate S3 bucket name format.

**Result:** ✅ S3 bucket name corrected, uploads working

---

## **Error 7: Invalid KMS Key ID**

### **Problem:**

```bash
0|contact- | Submission error: KMS.NotFoundException: Invalid keyId 'allas/aws/ssm'
0|contact- |   Code: 'KMS.NotFoundException',
```

### **📖 How to Read This Error (Log Analysis Skills):**

**1. Error Format Anatomy:**

```bash
0|contact-form  | Submission error: KMS.NotFoundException: Invalid keyId 'allas/aws/ssm'
│       │           │               │                              │
│       │           │               │                              └─ The invalid value
│       │           │               └─ Error type (NotFound)
│       │           └─ Service prefix
│       └─ Process name
└─ PM2 process ID
```

**Breaking it down:**

- **`KMS.NotFoundException`** → Service + Error Type
  - `KMS` = AWS Key Management Service
  - `NotFoundException` = Resource not found (doesn't exist)
  - Pattern: `Service.ErrorType`

- **`Invalid keyId 'allas/aws/ssm'`** → Specific error details
  - Shows the EXACT value that was rejected
  - Critical clue: `allas` instead of `alias` (typo!)

**2. Full Error Object (from complete logs):**

```javascript
{
  '$fault': 'client',              // CLIENT error (your mistake)
  '$retryable': undefined,
  '$metadata': {
    httpStatusCode: 400,           // 400 = Bad Request
    requestId: 'QBK2149BEVYXNER3',
    attempts: 1,
    totalRetryDelay: 0
  },
  Code: 'KMS.NotFoundException',   // ← Error code
  RequestId: 'QBK2149BEVYXNER3'
}
```

**3. Pattern Recognition - AWS Error Naming:**

| Pattern                         | Meaning                | Example                                    |
| ------------------------------- | ---------------------- | ------------------------------------------ |
| `Service.NotFoundException`     | Resource doesn't exist | `KMS.NotFoundException`, `S3.NoSuchBucket` |
| `Service.AccessDeniedException` | Permission denied      | `KMS.AccessDeniedException`                |
| `Service.ValidationException`   | Invalid input format   | `S3.InvalidBucketName`                     |
| `Service.ThrottlingException`   | Rate limit exceeded    | `SSM.ThrottlingException`                  |

**4. KMS-Specific Error Codes:**

| Error Code                 | Meaning           | Common Causes                                   |
| -------------------------- | ----------------- | ----------------------------------------------- |
| `NotFoundException`        | Key doesn't exist | Typo in key ID/alias, wrong region, key deleted |
| `AccessDeniedException`    | No permission     | Missing `kms:Decrypt` or `kms:GenerateDataKey`  |
| `InvalidKeyUsageException` | Key type wrong    | Using signing key for encryption                |
| `DisabledException`        | Key is disabled   | Key exists but disabled in KMS console          |

**5. Debugging Strategy for KMS Errors:**

```
KMS Error?
  ↓
1. Check error type → NotFoundException, AccessDenied, etc.
  ↓
2. Verify key ID/alias → Is it spelled correctly?
  ↓
3. KMS Key ID formats:
   - Key ID: 12345678-1234-1234-1234-123456789012
   - Key ARN: arn:aws:kms:region:account:key/12345...
   - Alias: alias/aws/ssm or alias/my-key
   ↓
4. Common typos:
   - allas vs alias ← Our case!
   - Missing 'alias/' prefix
   - Wrong service name
  ↓
5. Check if KMS is actually needed → Many use cases are optional
```

**6. Pro Tips:**

- ✅ **KMS aliases start with `alias/`** - Always include the prefix
- ✅ **AWS managed keys** - Format: `alias/aws/[service]` (e.g., `alias/aws/s3`)
- ✅ **Custom keys** - Format: `alias/your-key-name`
- ✅ **NotFoundException ≠ AccessDenied** - NotFound = doesn't exist, AccessDenied = exists but no permission
- ✅ **When in doubt, delete optional KMS params** - Many apps work fine with default encryption

**7. Stack Trace Reading:**

```bash
0|contact-form  |     at AwsRestXmlProtocol.handleError (...)
0|contact-form  |     at AwsRestXmlProtocol.deserializeResponse (...)
0|contact-form  |     at process.processTicksAndRejections (...)
0|contact-form  |     at async /home/ec2-user/contact-form-app/node_modules/@aws-sdk/middleware-sdk-s3/...
```

**What this tells us:**

- All paths are in `node_modules/@aws-sdk/` = AWS SDK code
- No paths to our app code = Error happened in AWS SDK before reaching our code
- This means: **Input validation failed** before the request even went to AWS
- The AWS SDK rejected the key ID format locally

### **Cause:**

Typo in Parameter Store value for `/contact-form/KMS_KEY_ID`: entered `allas/aws/ssm` instead of `alias/aws/ssm` (missing 'i' in 'alias').

### **Solution:**

**Option 1: Fix the typo** (if you need KMS encryption)

1. Go to **AWS Console** → **Systems Manager** → **Parameter Store**
2. Find `/contact-form/KMS_KEY_ID`
3. Click **Edit**
4. Change `allas/aws/ssm` to `alias/aws/ssm`
5. Click **Save changes**
6. Restart: `pm2 restart contact-form`

**Option 2: Delete parameter** (if KMS not needed - chosen solution)

1. KMS encryption is **optional** for this application
2. Delete `/contact-form/KMS_KEY_ID` parameter entirely
3. S3 will use default encryption instead
4. Restart: `pm2 restart contact-form`

**Key Learning:** KMS encryption is optional. If the parameter doesn't exist, the app skips KMS encryption for S3 uploads.

**Result:** ✅ Deleted KMS parameter, using default S3 encryption

---

## **Success: Form Submission Working**

### **Final Test:**

```
Message sent successfully.
```

**Full Architecture Working:**

```
✅ Amplify Frontend (https://main.dsd94dfus4op8.amplifyapp.com)
    ↓ HTTPS
✅ Custom Domain (https://backend-contact-form.godwintechservices.com)
    ↓ SSL/TLS
✅ ALB (Load Balancer with Certificate)
    ↓ HTTP
✅ EC2 (Node.js API with PM2 on port 3000)
    ↓
✅ S3 (File uploaded to my-contact-form-uploads-bucket)
    +
✅ RDS (Form data saved to contact_submissions table)
```

**Verification:**

- Form submission returns success message
- File appears in S3 bucket
- Data saved in RDS database

---

## **Warning: Node.js Deprecation (Not Critical)**

### **Warning Message:**

```bash
(node:33718) Warning: NodeDeprecationWarning: The AWS SDK for JavaScript (v3) will
no longer support Node.js v18.20.8 in January 2026.

To continue receiving updates to AWS services, bug fixes, and security
updates please upgrade to a supported Node.js LTS version.
```

### **Status:**

⚠️ **This is a warning, not an error.** The application runs fine with Node.js v18.20.8.

### **Explanation:**

- AWS SDK v3 will drop support for Node.js v18 in January 2026
- Current date: February 2026
- Your app still works, but future AWS SDK updates won't support this Node.js version

### **Future Action (Not Urgent):**

```bash
# When ready to upgrade, install Node.js 20 or 22 LTS
nvm install 20
nvm use 20
nvm alias default 20
```

**Result:** ⏳ Note for future upgrade, not blocking deployment

---

## **Security Best Practices Applied**

### **1. IAM Least Privilege**

✅ Only granted specific permissions:

- `ssm:GetParameters` - Read configuration only
- `secretsmanager:GetSecretValue` - Read secrets only
- `s3:PutObject` - Upload files only (no delete/list)

✅ Scoped to specific resources:

- `/contact-form/*` parameters only
- Specific secret ARN only
- Specific S3 bucket only

### **2. No Hardcoded Credentials**

✅ All secrets stored in AWS Secrets Manager
✅ Configuration in Parameter Store
✅ No `.env` files on server
✅ IAM role provides temporary credentials automatically

### **3. Separation of Concerns**

✅ Infrastructure (IAM) separate from application code
✅ Can update permissions without touching code
✅ Same code works across environments with different roles

---

## **Key Learnings**

### **1. AWS IAM Authorization Flow**

```
Request → IAM Policy Evaluation → Default DENY unless explicit ALLOW
```

### **2. EC2 Instance Profile**

- EC2 uses IAM roles via Instance Profiles
- Provides temporary credentials via STS
- No need for access keys in code

### **3. Git Authentication Methods**

- **SSH:** Requires key setup, more secure for frequent use
- **HTTPS:** Simpler for one-time clone, requires token for private repos

### **4. Amazon Linux Package Management**

- **AL2023:** Use `dnf` (not `yum`)
- **AL2:** Use `yum`

---

## **Deployment Checklist (What Worked)**

✅ **Step 1:** Install git on EC2

```bash
sudo dnf install git -y
```

✅ **Step 2:** Clone repository via HTTPS

```bash
git clone https://github.com/Godwin-svg/contact-form-app.git
cd contact-form-app
```

✅ **Step 3:** Install Node.js

```bash
sudo dnf install nodejs -y
```

✅ **Step 4:** Install dependencies

```bash
npm install
```

✅ **Step 5:** Configure IAM permissions

- Add policy to `contact-form-school-role`
- Include `ssm:GetParameters`, `secretsmanager:GetSecretValue`, `s3:PutObject`

✅ **Step 6:** Start application

```bash
npm start
```

✅ **Step 7:** Verify health check

```bash
curl http://localhost:3000/api/health
```

✅ **Step 8:** Set up custom domain with HTTPS

- Requested SSL certificate in AWS Certificate Manager (ACM)
- Added HTTPS (443) listener to ALB with certificate
- Configured DNS to point domain to ALB
- Custom domain: `https://backend-contact-form.godwintechservices.com`

✅ **Step 9:** Update frontend to use custom domain

```bash
# Updated public/index.html to use HTTPS custom domain
git add public/index.html
git commit -m "Update API endpoint to custom domain with HTTPS"
git push
```

✅ **Step 10:** Fix Parameter Store issues

- Removed trailing space from `/contact-form/S3_BUCKET_NAME`
- Deleted `/contact-form/KMS_KEY_ID` (optional parameter with typo)

✅ **Step 11:** Install PM2 for production and debugging

```bash
sudo npm install -g pm2
pm2 start server.js --name contact-form
pm2 logs contact-form
```

✅ **Step 12:** Test end-to-end

- Submitted form from Amplify: https://main.dsd94dfus4op8.amplifyapp.com/
- Result: "Message sent successfully" ✅
- Verified file uploaded to S3
- Verified data saved to RDS

---

## **Production Deployment Complete**

**Current Status:**

- ✅ Frontend deployed on Amplify with HTTPS
- ✅ Backend running on EC2 with PM2
- ✅ Custom domain configured with SSL
- ✅ ALB health checks passing
- ✅ Form submissions working end-to-end
- ✅ Files uploading to S3
- ✅ Data saving to RDS

**URLs:**

- **Frontend:** https://main.dsd94dfus4op8.amplifyapp.com/
- **Backend API:** https://backend-contact-form.godwintechservices.com/

---

## **Quick Reference - Common Commands**

### **Check Application Status**

```bash
# If running with npm start
ps aux | grep node

# If running with PM2
pm2 status
pm2 logs contact-form
```

### **Restart Application**

```bash
# With PM2
pm2 restart contact-form

# Without PM2
# Press Ctrl+C, then npm start
```

### **Pull Updates from GitHub**

```bash
cd contact-form-app
git pull
npm install
pm2 restart contact-form
```

### **Check IAM Permissions (on EC2)**

```bash
# Test Parameter Store access
aws ssm get-parameters --names /contact-form/S3_BUCKET_NAME --region us-east-1

# Test Secrets Manager access
aws secretsmanager get-secret-value --secret-id contact-form-secret1 --region us-east-1
```

### **View Application Logs**

```bash
# With PM2
pm2 logs contact-form --lines 100

# Without PM2 (if running in foreground)
# Logs appear directly in terminal
```

---

## **📚 Senior Dev Log Reading Guide**

This section teaches you how to systematically read and debug logs like a senior developer.

### **1. The Log Reading Mindset**

**Rule #1: Don't Panic**

- Errors are information, not failures
- Every error tells you exactly what went wrong
- Learn to read errors as helpful messages, not scary warnings

**Rule #2: Read Complete Errors**

- Don't stop at "Error" or "Access Denied"
- Read the full message - every word matters
- The solution is usually IN the error message

**Rule #3: Bottom-Up for Stack Traces**

- Start at the bottom (where execution began)
- Work up to the top (where it crashed)
- Find YOUR code (not node_modules)

---

### **2. Anatomy of AWS SDK Errors**

**Standard AWS Error Structure:**

```javascript
{
  '$fault': 'client' | 'server',        // WHO is at fault
  '$retryable': true | false,           // CAN you retry
  '$metadata': {
    httpStatusCode: 400,                // HTTP status code
    requestId: 'XXXXX',                 // AWS request identifier
    attempts: 1,                        // Number of retry attempts
    totalRetryDelay: 0                  // Total delay from retries
  },
  Code: 'ErrorType',                    // Error code identifier
  Message: 'Human readable message',    // What went wrong
  // Service-specific fields...
}
```

**What each field tells you:**

| Field            | Value      | Meaning           | Action               |
| ---------------- | ---------- | ----------------- | -------------------- |
| `$fault`         | `'client'` | **Your mistake**  | Fix your code/config |
| `$fault`         | `'server'` | **AWS issue**     | Retry or wait        |
| `httpStatusCode` | `400-499`  | Client error      | Check your input     |
| `httpStatusCode` | `500-599`  | Server error      | AWS problem, retry   |
| `$retryable`     | `true`     | Temporary failure | SDK will retry       |
| `$retryable`     | `false`    | Permanent failure | Must fix code        |

---

### **3. HTTP Status Code Quick Reference**

| Code        | Category     | Meaning                       | Common Examples                     |
| ----------- | ------------ | ----------------------------- | ----------------------------------- |
| **200-299** | Success      | Request succeeded             | 200 OK, 201 Created                 |
| **400**     | Client Error | Bad request syntax            | Malformed JSON, invalid parameter   |
| **401**     | Client Error | Authentication required       | Missing/invalid API key             |
| **403**     | Client Error | Forbidden (permission denied) | IAM permission missing              |
| **404**     | Client Error | Resource not found            | Bucket doesn't exist, key not found |
| **409**     | Client Error | Conflict                      | Resource already exists             |
| **429**     | Client Error | Too many requests             | Rate limit exceeded                 |
| **500**     | Server Error | Internal server error         | AWS service issue                   |
| **502**     | Server Error | Bad gateway                   | Load balancer can't reach backend   |
| **503**     | Server Error | Service unavailable           | AWS service temporarily down        |
| **504**     | Server Error | Gateway timeout               | Request took too long               |

---

### **4. Reading Stack Traces**

**Example Stack Trace:**

```bash
0|contact-form  | Submission error: InvalidBucketName: The specified bucket is not valid.
0|contact-form  |     at ProtocolLib.getErrorSchemaOrThrowBaseException (/home/ec2-user/contact-form-app/node_modules/@aws-sdk/core/dist-cjs/submodules/protocols/index.js:69:67)
0|contact-form  |     at AwsRestXmlProtocol.handleError (/home/ec2-user/contact-form-app/node_modules/@aws-sdk/core/dist-cjs/submodules/protocols/index.js:1810:65)
0|contact-form  |     at AwsRestXmlProtocol.deserializeResponse (/home/ec2-user/contact-form-app/node_modules/@smithy/core/dist-cjs/submodules/protocols/index.js:314:24)
0|contact-form  |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
0|contact-form  |     at async /home/ec2-user/contact-form-app/node_modules/@smithy/middleware-retry/dist-cjs/index.js:254:46
0|contact-form  |     at async /home/ec2-user/contact-form-app/node_modules/@aws-sdk/middleware-sdk-s3/dist-cjs/index.js:63:28
```

**How to read it:**

1. **Top Line** = Error name and message
   - `InvalidBucketName: The specified bucket is not valid`
   - This is THE most important line

2. **Stack frames** (read bottom to top):
   - **Bottom** = Where execution started (oldest)
   - **Top** = Where error was thrown (newest)

3. **Look for your code**:
   - Lines with your project path: `/home/ec2-user/contact-form-app/server.js`
   - Skip node_modules lines (3rd party libraries)
   - In this example: All lines are in node_modules = AWS SDK threw error

4. **What "at async" means**:
   - `at async` = Inside an async function
   - Shows the async call chain
   - Helps trace asynchronous operations

5. **File paths decode**:
   - `/home/ec2-user/contact-form-app/server.js:261:24`
   - Path: `/home/ec2-user/contact-form-app/server.js`
   - Line: `261`
   - Column: `24`

**Pro tip:** When ALL stack frames are in `node_modules`, the error happened in a library BEFORE your code ran. This usually means:

- Bad input to the library
- Configuration issue
- API misuse

---

### **5. PM2 Log Format**

**Understanding PM2 output:**

```bash
0|contact-form  | Server running on http://localhost:3000
│       │        │
│       │        └─ Actual log message
│       └─ Process name (from pm2 start server.js --name contact-form)
└─ Process ID (0, 1, 2, etc.)
```

**PM2 Log Types:**

- **Out logs** (`/logs/contact-form-out.log`) = stdout, console.log()
- **Error logs** (`/logs/contact-form-error.log`) = stderr, console.error(), uncaught errors

**Useful PM2 commands:**

```bash
pm2 logs contact-form                # Watch live logs (both out and error)
pm2 logs contact-form --lines 100    # Show last 100 lines
pm2 logs contact-form --err          # Show only error logs
pm2 logs contact-form --out          # Show only output logs
pm2 flush contact-form               # Clear all logs
```

---

### **6. Common Error Patterns and Solutions**

| Error Pattern                  | What It Means                | How to Fix                          |
| ------------------------------ | ---------------------------- | ----------------------------------- |
| `is not authorized to perform` | IAM permission missing       | Add permission to IAM role          |
| `InvalidBucketName`            | S3 bucket name invalid       | Check for spaces, invalid chars     |
| `NoSuchBucket`                 | S3 bucket doesn't exist      | Create bucket or fix typo           |
| `NotFoundException`            | Resource doesn't exist       | Check resource ID/name spelling     |
| `AccessDeniedException`        | Permission denied            | Add IAM permission                  |
| `ValidationException`          | Input validation failed      | Check input format/values           |
| `ThrottlingException`          | Rate limit exceeded          | Add retry logic, slow down requests |
| `Connection refused`           | Can't reach service          | Check security groups, network      |
| `ECONNREFUSED`                 | Connection refused (Node.js) | Service not running, wrong port     |
| `ETIMEDOUT`                    | Request timed out            | Check network, security groups      |

---

### **7. Debugging Workflow**

**Step-by-step debugging process:**

```
1. REPRODUCE THE ERROR
   └─ Can you trigger it consistently?
      ├─ Yes → Continue
      └─ No → Make it reproducible first

2. READ THE COMPLETE ERROR
   └─ Error name, message, stack trace, error object
      ├─ Look for YOUR code in stack trace
      └─ Copy exact error message

3. IDENTIFY ERROR CATEGORY
   └─ Client ($fault: 'client', 4xx) or Server (5xx)?
      ├─ Client → Your mistake, fix config/code
      └─ Server → AWS issue, retry or wait

4. FIND THE ROOT CAUSE
   └─ What value/config caused the error?
      ├─ Check error object for actual values
      └─ Trace back to source (Parameter Store, user input, etc.)

5. VERIFY THE FIX
   └─ After fixing, test the same scenario
      ├─ Works → Document the fix
      └─ Still broken → Read error again, repeat process

6. DOCUMENT THE SOLUTION
   └─ What was wrong, how you fixed it
      └─ Future you will thank present you
```

---

### **8. Pro Tips for Log Analysis**

**✅ DO:**

- Read the ENTIRE error message
- Copy error messages for searching/documentation
- Check the actual VALUES in error objects (look for typos, spaces)
- Save RequestId for AWS support tickets
- Use `pm2 logs --lines 200` for context around errors
- Test fixes by reproducing the error scenario
- Document solutions in troubleshooting guide

**❌ DON'T:**

- Stop reading at "Error" or "Access Denied"
- Assume you know the error without reading it
- Ignore stack traces (they show WHERE it failed)
- Skip checking actual values (trailing spaces are invisible!)
- Restart without understanding what went wrong
- Make multiple changes at once (can't tell what fixed it)

---

### **9. Quick Diagnosis Checklist**

When you encounter an error, ask these questions:

- [ ] **What service?** (S3, SSM, Secrets Manager, RDS, etc.)
- [ ] **What action?** (GetParameters, PutObject, GetSecretValue, etc.)
- [ ] **What resource?** (Bucket name, parameter path, secret ID, etc.)
- [ ] **Client or server fault?** ($fault field, HTTP status code)
- [ ] **Retryable?** ($retryable field)
- [ ] **What's the actual value?** (Check error object for the value that failed)
- [ ] **Where did this value come from?** (Parameter Store, hardcoded, user input?)
- [ ] **Is it spelled correctly?** (Watch for typos: allas vs alias)
- [ ] **Any invisible characters?** (Trailing spaces, tabs, newlines)
- [ ] **Correct permissions?** (Check IAM policies)

Answer these questions and you'll find the root cause 90% of the time.

---

## **Contact & Support**

If you encounter new errors:

1. **Check CloudWatch Logs** (if configured)
2. **Check PM2 logs:** `pm2 logs contact-form`
3. **Check IAM permissions** in AWS Console
4. **Verify AWS resources exist:**
   - Parameter Store parameters
   - Secrets Manager secret
   - RDS database (status: Available)
   - S3 bucket
   - Security Groups allow traffic

---

**Last Updated:** February 21, 2026  
**Status:** Full deployment complete ✅  
**Frontend:** https://main.dsd94dfus4op8.amplifyapp.com/  
**Backend:** https://backend-contact-form.godwintechservices.com/
