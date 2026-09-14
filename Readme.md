# 💬 Cloud-Native Real-Time Chat App Deployment on AWS EKS

## 📌 Project Overview

This project demonstrates a **complete cloud-native deployment** of a full-stack application using modern DevOps practices and AWS managed services.

The application is a **real-time chat app** built with **React (frontend) and Node.js + Socket.IO (backend)**, containerized with **Docker**, stored in **AWS ECR**, and deployed on **AWS EKS (Elastic Kubernetes Service)** with production-grade load balancing using **AWS ALB**.

> This started life as a 2048 game project. The app layer was swapped for a chat app; the entire DevOps pipeline (Docker → ECR → EKS → ALB Ingress) is unchanged — that's the point of the demo. This build targets **EKS only** — there's no Docker Compose / local-run path; Docker is used solely to build the images that get pushed to ECR.

![UI](diagram/1.jpg)

---

## 🏗️ Architecture Diagram

![Architecture](diagram/2.jpg)

---

## ⚙️ Workflow Diagram

```text
+-----------------+      +----------------------+      +-------------------------+
|   Developer     |----->|     Docker Build     |----->|     AWS ECR             |
| (local machine) |      | (Container Images)   |      | (Image Registry)        |
+-----------------+      +----------------------+      +------------+------------+
                                                                    |
                                                                    | Pull Images
                                                                    v
+-----------------+      +----------------------+      +-------------------------+
|   AWS EKS       |<-----|   kubectl apply      |<-----|   AWS CLI/eksctl        |
| (Kubernetes)    |      |   (Deploy Manifests) |      |   (Cluster Management)   |
+-----------------+      +----------------------+      +-------------------------+
        |
        | Deploy
        v
+-------------------------------------------------------------------------------+
|                         AWS Application Load Balancer (ALB)                   |
|                                   (Ingress)                                   |
+-------------------------------------------------------------------------------+
        |
        +------------------------+------------------------+
        |                        |                        |
        v                        v                        v
+-----------------+      +-----------------+      +-----------------+
| React Frontend  |      | React Frontend  |      | Node + Socket.IO |
| (Pod/Service)   |      | (Pod/Service)   |      | (Pod/Service)    |
+-----------------+      +-----------------+      +-----------------+
```

---

## 🛠️ Technologies Used

| Technology              | Purpose                           |
| ----------------------- | --------------------------------- |
| **React**               | Frontend UI framework             |
| **Node.js + Socket.IO** | Backend API + real-time messaging |
| **Docker**              | Containerization                  |
| **AWS ECR**             | Container registry                |
| **AWS EKS**             | Kubernetes orchestration          |
| **AWS ALB**             | Application load balancing        |
| **kubectl**             | Kubernetes CLI                    |
| **eksctl**              | EKS cluster management            |
| **Helm**                | Package management                |

---

## 💬 About the App

A single shared chat room:

* Pick a username to join.
* Messages broadcast instantly to everyone connected via a WebSocket (Socket.IO).
* Live **online users** list and a typing indicator.
* Message history (last 100 messages) is kept **in-memory** on the server.
* History resets if the server pod restarts.

### API/Socket Surface

| Path              | Type      | Purpose                 |
| ----------------- | --------- | ----------------------- |
| `GET /health`     | REST      | Liveness check          |
| `GET /api/status` | REST      | Simple API status check |
| `/socket.io`      | WebSocket | Real-time chat channel  |

---

## ⚠️ Scaling Note

The server keeps chat state (messages and online users) **in-memory in a single process**.

The `chat-server` deployment is intentionally configured with:

```yaml
replicas: 1
```

With more than one replica and no shared pub/sub between pods, users connected to different pods would not see each other's messages.

For horizontal scaling in a real production deployment, a **Socket.IO Redis adapter** or another shared messaging mechanism should be introduced.

The React client (`chat-client`) is stateless and safely runs with:

```yaml
replicas: 2
```

---

# 🚀 Deployment Steps

## Step 1: Launch Ubuntu EC2 Instance

Use an Ubuntu EC2 instance as the build/deployment server.

1. Go to the AWS EC2 Console.
2. Launch a new instance.
3. Select **Ubuntu 22.04 LTS**.
4. Instance type: **t2.medium**.
5. Create a key pair for SSH access.
6. Configure the security group with **SSH (22)** access as required.

![EC2 Instance](diagram/3.jpg)

---

## Step 2: Install Docker

Docker is used to **build the application images** that will be pushed to Amazon ECR.

```bash
# Update packages
sudo apt update -y
sudo apt upgrade -y

# Install Docker
sudo apt install docker.io -y

# Start Docker
sudo systemctl start docker

# Enable Docker at boot
sudo systemctl enable docker

# Add current user to Docker group
sudo usermod -aG docker $USER

# Apply group change
newgrp docker

# Verify Docker installation
docker --version
```

---

## Step 3: Install AWS CLI

```bash
# Download AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" \
  -o "awscliv2.zip"

# Extract
unzip awscliv2.zip

# Install
sudo ./aws/install

# Verify
aws --version
```

Configure AWS credentials:

```bash
aws configure
```

Provide:

```text
AWS Access Key ID
AWS Secret Access Key
Default region: <your-aws-region>
Output format: json
```

> Replace `<your-aws-region>` with whichever AWS region you want to deploy into (e.g. `us-east-1`, `ap-south-1`). This project does not hard-code a region anywhere — Step 4 automatically fetches this value back out with `aws configure get region`.

Verify AWS access:

```bash
aws sts get-caller-identity
```

---

## Step 4: Set AWS Environment Variables

Nothing in this project is hard-coded to a specific AWS account or region — both are fetched automatically from your configured AWS CLI credentials and exported as shell variables. Every command and manifest later in this guide (`eksctl`, `aws ecr`, `envsubst`, the `${ECR_REGISTRY}` placeholder in the Kubernetes manifests, etc.) relies on these two variables being exported first.

**1. Fetch your AWS Region** (read from your `aws configure` setup — no manual typing):

```bash
export AWS_REGION=$(aws configure get region)
```

**2. Fetch your AWS Account ID** (read from `aws sts get-caller-identity` — no manual typing):

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity \
  --query Account \
  --output text)
```

**3. Verify both are set:**

```bash
echo "AWS Account ID: $ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
```

Expected output (values will match your own account/region, not the example below):

```text
AWS Account ID: <your-account-id>
AWS Region: <your-aws-region>
```

> **Note:** These two exports are the only place your account/region get resolved. Everything downstream (ECR registry URL, `eksctl create cluster`, the `envsubst` step for `server.yml`/`client.yml`) derives from `$AWS_REGION` and `$ACCOUNT_ID` — nothing is hard-coded into the Kubernetes manifests or scripts. If `AWS_REGION` comes back empty, it means no default region is set in your AWS CLI config — run `aws configure` once and set a region, then re-run this step.

Set the ECR registry variable:

```bash
export ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo $ECR_REGISTRY
```

---

## Step 5: Install Kubernetes Tools

### 1. Install kubectl

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

chmod +x kubectl

sudo mv kubectl /usr/local/bin/

kubectl version --client
```

### 2. Install eksctl

```bash
# Detect architecture
ARCH=amd64

# For ARM systems, use:
# ARCH=arm64

PLATFORM=$(uname -s)_$ARCH

# Download latest eksctl
curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_${PLATFORM}.tar.gz"

# Verify checksum
curl -sL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_checksums.txt" \
  | grep "$PLATFORM" \
  | sha256sum --check

# Extract
tar -xzf "eksctl_${PLATFORM}.tar.gz" -C /tmp

# Remove archive
rm "eksctl_${PLATFORM}.tar.gz"

# Install
sudo install -m 0755 /tmp/eksctl /usr/local/bin/eksctl

# Remove temporary file
rm /tmp/eksctl

# Verify
eksctl version
```

### 3. Install Helm

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

helm version
```

---

# Step 6: Create EKS Cluster

Create the EKS cluster:

```bash
eksctl create cluster \
  --name my-chat-cluster \
  --region $AWS_REGION \
  --nodegroup-name workers \
  --node-type t3.medium \
  --nodes 2
```

Configure `kubectl`:

```bash
aws eks update-kubeconfig \
  --region $AWS_REGION \
  --name my-chat-cluster
```

Verify the cluster:

```bash
kubectl get nodes
```

---

# Step 7: Push Docker Images to ECR

## 1. Create ECR Repositories

```bash
# Create frontend repository
aws ecr create-repository \
  --repository-name chat-client \
  --region $AWS_REGION

# Create backend repository
aws ecr create-repository \
  --repository-name chat-server \
  --region $AWS_REGION
```

### Login to ECR

```bash
aws ecr get-login-password --region $AWS_REGION \
  | docker login \
  --username AWS \
  --password-stdin $ECR_REGISTRY
```

You should receive:

```text
Login Succeeded
```

---

## 2. Build and Push Frontend Image

Navigate to the client directory:

```bash
cd client
```

Build the Docker image:

```bash
docker build -t chat-client .
```

Tag the image:

```bash
docker tag chat-client:latest \
  $ECR_REGISTRY/chat-client:latest
```

Push the image:

```bash
docker push \
  $ECR_REGISTRY/chat-client:latest
```

---

## 3. Build and Push Backend Image

Navigate to the server directory:

```bash
cd ../server
```

Build the backend image:

```bash
docker build -t chat-server .
```

Tag the image:

```bash
docker tag chat-server:latest \
  $ECR_REGISTRY/chat-server:latest
```

Push the image:

```bash
docker push \
  $ECR_REGISTRY/chat-server:latest
```

Verify images in ECR:

```bash
aws ecr describe-images \
  --repository-name chat-client \
  --region $AWS_REGION

aws ecr describe-images \
  --repository-name chat-server \
  --region $AWS_REGION
```

---

# Step 8: Configure AWS Load Balancer Controller

## 1. Enable OIDC Provider

```bash
eksctl utils associate-iam-oidc-provider \
  --region $AWS_REGION \
  --cluster my-chat-cluster \
  --approve
```

---

## 2. Create IAM Policy

Download the AWS Load Balancer Controller IAM policy:

```bash
curl -o iam_policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
```

Create the IAM policy:

```bash
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

---

## 3. Create IAM Service Account

```bash
eksctl create iamserviceaccount \
  --cluster my-chat-cluster \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve
```

---

## 4. Install AWS Load Balancer Controller

Add the Helm repository:

```bash
helm repo add eks https://aws.github.io/eks-charts

helm repo update
```

Get the VPC ID:

```bash
export VPC_ID=$(aws eks describe-cluster \
  --name my-chat-cluster \
  --region $AWS_REGION \
  --query "cluster.resourcesVpcConfig.vpcId" \
  --output text)

echo $VPC_ID
```

Install the controller:

```bash
helm install aws-load-balancer-controller \
  eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=my-chat-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=$AWS_REGION \
  --set vpcId=$VPC_ID
```

Verify:

```bash
kubectl get deployment \
  -n kube-system \
  aws-load-balancer-controller
```

---

# Step 9: Kubernetes Deployment Manifests

> **Important:** The Kubernetes manifests need the ECR registry path. Since `ACCOUNT_ID` is stored as an environment variable in the shell, use `envsubst` to generate the final manifests.

## Server Deployment

Example `server.yml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-server
  namespace: chat-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: chat-server
  template:
    metadata:
      labels:
        app: chat-server
    spec:
      containers:
        - name: server
          image: ${ECR_REGISTRY}/chat-server:latest
          ports:
            - containerPort: 5000
          env:
            - name: PORT
              value: "5000"
---
apiVersion: v1
kind: Service
metadata:
  name: chat-server-service
  namespace: chat-app
spec:
  selector:
    app: chat-server
  ports:
    - port: 5000
      targetPort: 5000
  type: ClusterIP
```

## Client Deployment

Example `client.yml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-client
  namespace: chat-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: chat-client
  template:
    metadata:
      labels:
        app: chat-client
    spec:
      containers:
        - name: client
          image: ${ECR_REGISTRY}/chat-client:latest
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: chat-client-service
  namespace: chat-app
spec:
  selector:
    app: chat-client
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
```

## Ingress

Example `ingress.yml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: chat-ingress
  namespace: chat-app
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80}]'

    # Socket.IO keeps a long-lived connection open.
    alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=3600

spec:
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: chat-client-service
                port:
                  number: 80

          - path: /api
            pathType: Prefix
            backend:
              service:
                name: chat-server-service
                port:
                  number: 5000

          - path: /socket.io
            pathType: Prefix
            backend:
              service:
                name: chat-server-service
                port:
                  number: 5000
```

---

# Step 10: Deploy to Kubernetes

Create the namespace:

```bash
kubectl create namespace chat-app
```

Apply the manifests using `envsubst`:

```bash
envsubst < server.yml | kubectl apply -f -

envsubst < client.yml | kubectl apply -f -

kubectl apply -f ingress.yml
```

Verify deployments:

```bash
kubectl get deployments -n chat-app
```

Check pods:

```bash
kubectl get pods -n chat-app
```

Check services:

```bash
kubectl get services -n chat-app
```

Check ingress:

```bash
kubectl get ingress -n chat-app
```

Wait for the AWS ALB to be provisioned.

---

# Step 11: Access the Application

Get the ALB DNS name:

```bash
kubectl get ingress -n chat-app
```

Example output:

```text
NAME           CLASS    HOSTS   ADDRESS                                      PORTS
chat-ingress   <none>   *       k8s-chatapp-chatingr-xxxxxxxxxx-xxxx.elb.amazonaws.com   80
```

Open the ALB address in your browser:

```text
http://<ALB-DNS-NAME>
```

Open the application in two browser tabs or on two devices with different usernames.

Messages should appear in real time through Socket.IO.

---

# 🔍 Verify Deployment

Check all Kubernetes resources:

```bash
kubectl get all -n chat-app
```

Check ingress details:

```bash
kubectl describe ingress chat-ingress -n chat-app
```

Check application logs:

```bash
kubectl logs -n chat-app deployment/chat-server
```

Check frontend logs:

```bash
kubectl logs -n chat-app deployment/chat-client
```

Check AWS Load Balancer Controller logs:

```bash
kubectl logs \
  -n kube-system \
  deployment/aws-load-balancer-controller
```

---

# 🧹 AWS Cleanup

To avoid unnecessary AWS charges, delete the resources after completing the project — **in the order below**. Deleting the EKS cluster before the Ingress/ALB is removed can leave the load balancer, target groups, and associated security groups orphaned in your AWS account, still generating charges.

## 1. Delete the Ingress (removes the ALB first)

Deleting the Ingress signals the AWS Load Balancer Controller to clean up the ALB, target groups, and listener rules it created — while the controller pod is still running to do it.

```bash
kubectl delete ingress chat-ingress -n chat-app
```

Or delete the whole namespace, which removes the Ingress along with the Deployments and Services:

```bash
kubectl delete namespace chat-app
```

**Verify the ALB is actually gone** before moving on — deletion can take a minute or two:

```bash
aws elbv2 describe-load-balancers --region $AWS_REGION \
  --query "LoadBalancers[?contains(LoadBalancerName, 'k8s-chatapp')].LoadBalancerArn" \
  --output text
```

If this returns an ARN, the ALB is still around — wait and re-check. If it returns nothing, it's clear.

> **If you already deleted the cluster first:** `eksctl delete cluster` also runs its own "clean up AWS load balancers created by Kubernetes objects" step before tearing down the control plane, so in most cases the ALB is removed automatically anyway. Still, run the check above to be sure — if an ALB or target group is left behind, delete it manually:
> ```bash
> aws elbv2 delete-load-balancer --load-balancer-arn <ARN> --region $AWS_REGION
>
> aws elbv2 describe-target-groups --region $AWS_REGION \
>   --query "TargetGroups[?contains(TargetGroupName, 'k8s-chatapp')].TargetGroupArn" \
>   --output text
>
> aws elbv2 delete-target-group --target-group-arn <ARN> --region $AWS_REGION
> ```

## 2. Delete EKS Cluster

```bash
eksctl delete cluster \
  --name my-chat-cluster \
  --region $AWS_REGION
```

This tears down the node group, the IAM service account role and OIDC provider created for the Load Balancer Controller, the control plane, and (if `eksctl` created it) the cluster's VPC, subnets, NAT Gateway, and route tables.

## 3. Delete ECR Repositories

```bash
aws ecr delete-repository \
  --repository-name chat-client \
  --region $AWS_REGION \
  --force

aws ecr delete-repository \
  --repository-name chat-server \
  --region $AWS_REGION \
  --force
```

## 4. Delete IAM Policy

IAM policies can't be deleted while they have more than one version — the non-default versions have to go first.

```bash
# List all versions
aws iam list-policy-versions \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy
```

Delete every version where `"IsDefaultVersion": false` (repeat for each non-default `VersionId`, e.g. `v1`):

```bash
aws iam delete-policy-version \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy \
  --version-id v1
```

Then delete the policy itself — the default version is removed automatically with it:

```bash
aws iam delete-policy \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy
```

> Make sure the EKS cluster and IAM service account are no longer using the policy before deleting it (Step 2 above already removes the service account that referenced it).

## 5. Final Manual Checks

A few resources can occasionally survive cluster teardown, especially if `eksctl` didn't own the VPC or if deletion was interrupted. Check these in the AWS Console before considering the environment fully clean:

| Resource | Where to check | What to look for |
| --- | --- | --- |
| Load Balancers | EC2 → Load Balancers | No `k8s-chatapp-...` ALB left |
| Target Groups | EC2 → Target Groups | No `k8s-chatapp-...` target group left |
| Elastic IPs | EC2 → Elastic IPs | No unassociated EIPs (these are billed even when idle) |
| NAT Gateway | VPC → NAT Gateways | Should show "Deleted" or be gone entirely |
| VPC | VPC → Your VPCs | The cluster's VPC should be gone if `eksctl` created it; delete manually if it's still there and unused |
| EC2 Instances | EC2 → Instances | No leftover worker nodes |

Once all of the above are clear, the AWS environment is fully cleaned up and no further charges should be incurred for this project.

---

# 🎓 Conclusion

This project demonstrates the deployment of a **cloud-native real-time chat application on AWS EKS** using modern DevOps tools and AWS managed services.

### Key Achievements

* Containerized frontend and backend applications using Docker.
* Stored container images securely in Amazon ECR.
* Deployed the application on Amazon EKS.
* Used Kubernetes Deployments and Services for application management.
* Configured AWS Load Balancer Controller.
* Exposed the application through an AWS Application Load Balancer.
* Implemented WebSocket-aware routing for Socket.IO.
* Used Kubernetes rolling updates for application deployment.
* Used IAM and OIDC for AWS Load Balancer Controller permissions.
* Automated ECR image tagging using the AWS Account ID.
* Used environment variables to avoid hard-coding AWS-specific values.
* Demonstrated production-oriented cloud-native deployment practices.

---

# 🏆 Final Outcome

This project showcases practical experience with:

**Docker → Amazon ECR → Kubernetes → Amazon EKS → AWS Load Balancer Controller → ALB → React + Node.js + Socket.IO**

It demonstrates skills in **containerization, Kubernetes orchestration, AWS cloud services, IAM, ECR, EKS, Helm, CI/CD-ready deployment practices, networking, load balancing, and real-time application architecture.**

---

*Built with ❤️ by **Naman Pandey** | DevOps Engineer | Cloud-Native Architecture 🚀*
