# 🧩 Cloud-Native 2048 Game Deployment on AWS EKS

## 📌 Project Overview

This project demonstrates a **complete cloud-native deployment** of a full-stack application using modern DevOps practices and AWS managed services.

The application is a classic **2048 game** built with **React (frontend) and Node.js (backend)**, containerized with **Docker**, stored in **AWS ECR**, and deployed on **AWS EKS (Elastic Kubernetes Service)** with production-grade load balancing using **AWS ALB**.

![UI](diagram/1.jpg)

## 🏗️ Architecture Diagram

![Architecture](diagram/2.png)

## ⚙️ Workflow Diagram

```
+-----------------+      +----------------------+      +-------------------------+
|   Developer     |----->|     Docker Build     |----->|     AWS ECR             |
| (local machine) |      | (Container Images)   |      | (Image Registry)        |
+-----------------+      +----------------------+      +------------+------------+
                                                                     |
                                                                     | Pull Images
                                                                     v
+-----------------+      +----------------------+      +-------------------------+
|   AWS EKS       |<-----|   kubectl apply      |<-----|   AWS CLI/eksctl        |
| (Kubernetes)    |      | (Deploy Manifests)   |      | (Cluster Management)     |
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
| React Frontend  |      | React Frontend  |      | Node Backend    |
| (Pod/Service)   |      | (Pod/Service)   |      | (Pod/Service)   |
+-----------------+      +-----------------+      +-----------------+
```

## 🛠️ Technologies Used

| Technology | Purpose |
|------------|---------|
| **React** | Frontend UI framework |
| **Node.js** | Backend API server |
| **Docker** | Containerization |
| **AWS ECR** | Container registry |
| **AWS EKS** | Kubernetes orchestration |
| **AWS ALB** | Application load balancing |
| **kubectl** | Kubernetes CLI |
| **eksctl** | EKS cluster management |
| **Helm** | Package management |


## Step 1: Launch Ubuntu EC2 Instance (Build Server)

1. Go to AWS EC2 console
2. Launch a new instance
3. Select **Ubuntu 22.04 LTS**
4. Instance type: **t2.medium** (minimum for building images)
5. Create a key pair for SSH access
6. Configure security group with **SSH (22) only**

![EC2 Instance](diagram/3.jpg)

## Step 2: Install Docker & Docker Compose

```bash
# Update packages
sudo apt update -y
sudo apt upgrade -y

# Install Docker
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker

# Add user to Docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker
docker --version

# Install Docker Compose
sudo apt install docker-compose -y
docker compose version
```

## Step 3: Install AWS CLI

```bash
# Download and install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version

# Configure AWS credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-2), Output format (json)
```

## Step 4: Install Kubernetes Tools

**1) Install kubectl**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
kubectl version --client
```

**2) Install eksctl**

```bash
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz" | tar xz
sudo mv eksctl /usr/local/bin
eksctl version
```

**3) Install Helm**
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

## Step 5: Create EKS Cluster

```bash
# Create EKS cluster (takes 15-20 minutes)
eksctl create cluster \
  --name my-game-cluster \
  --region us-east-2 \
  --nodegroup-name workers \
  --node-type t3.medium \
  --nodes 2

# Configure kubectl to use the new cluster
aws eks update-kubeconfig --region us-east-2 --name my-game-cluster

# Verify nodes
kubectl get nodes
```

## Step 6: Push Docker Images to ECR

**1) Create ECR Repositories**
```bash
# Create repositories
aws ecr create-repository --repository-name game-client
aws ecr create-repository --repository-name game-server

# Login to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com
```

**2) Build and Push Frontend Image**
```bash
# Navigate to client directory
cd client

# Build frontend image
docker build -t game-client .

# Tag and push
docker tag game-client:latest <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/game-client:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/game-client:latest
```

**3) Build and Push Backend Image**
```bash
# Navigate to server directory
cd ../server

# Build backend image
docker build -t game-server .

# Tag and push
docker tag game-server:latest <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/game-server:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/game-server:latest
```

## Step 7: Configure AWS Load Balancer Controller

**1) Enable OIDC Provider**
```bash
eksctl utils associate-iam-oidc-provider \
  --region us-east-2 \
  --cluster my-game-cluster \
  --approve
```

**2) Create IAM Policy**
```bash
# Download policy
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json

# Create policy
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

**3) Create IAM Service Account**
```bash
eksctl create iamserviceaccount \
  --cluster my-game-cluster \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve
```

**4) Install Controller via Helm**
```bash
# Add Helm repo
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Install controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=my-game-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=us-east-2 \
  --set vpcId=<YOUR_VPC_ID>
```

## Step 8: Kubernetes Deployment Manifests

### Server Deployment (server.yml)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: game-server
  namespace: game
spec:
  replicas: 2
  selector:
    matchLabels:
      app: game-server
  template:
    metadata:
      labels:
        app: game-server
    spec:
      containers:
      - name: server
        image: <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/game-server:latest
        ports:
        - containerPort: 5000
        env:
        - name: PORT
          value: "5000"
---
apiVersion: v1
kind: Service
metadata:
  name: game-server-service
  namespace: game
spec:
  selector:
    app: game-server
  ports:
  - port: 5000
    targetPort: 5000
  type: ClusterIP
```

### Client Deployment (client.yml)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: game-client
  namespace: game
spec:
  replicas: 2
  selector:
    matchLabels:
      app: game-client
  template:
    metadata:
      labels:
        app: game-client
    spec:
      containers:
      - name: client
        image: <ACCOUNT_ID>.dkr.ecr.us-east-2.amazonaws.com/game-client:latest
        ports:
        - containerPort: 80
        env:
        - name: REACT_APP_API_URL
          value: "/api"
---
apiVersion: v1
kind: Service
metadata:
  name: game-client-service
  namespace: game
spec:
  selector:
    app: game-client
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
```

### Ingress (ingress.yml)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: game-ingress
  namespace: game
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80}]'
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: game-client-service
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: game-server-service
            port:
              number: 5000
```

## Step 9: Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace game

# Apply all manifests
kubectl apply -f server.yaml
kubectl apply -f client.yaml
kubectl apply -f ingress.yaml

# Check deployments
kubectl get deployments -n game

# Check pods
kubectl get pods -n game

# Check services
kubectl get services -n game

# Check ingress (wait for ALB provisioning)
kubectl get ingress -n game
```

## Step 10: Access the Application

```bash
# Get ALB DNS name
kubectl get ingress -n game

# Output example:
# NAME           CLASS    HOSTS   ADDRESS                                      PORTS   AGE
# game-ingress   <none>   *       k8s-game-gameingr-xxxxxxxxxx-xxxx.elb.amazonaws.com   80      5m
```
Open in browser: `http://k8s-game-gameingr-xxxxxxxxxx-xxxx.elb.amazonaws.com`

## ✅ Verify Deployment

```bash
# Check all resources
kubectl get all -n game

# Check ingress details
kubectl describe ingress game-ingress -n game

# Check ALB logs (if needed)
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```


## 🧹 AWS Cleanup (Avoid Billing 💰)

```bash
# 1. Delete EKS Cluster
eksctl delete cluster --name my-game-cluster --region us-east-2

# 2. Delete ECR Repositories
aws ecr delete-repository --repository-name game-client --force
aws ecr delete-repository --repository-name game-server --force

# 3. Delete IAM Policy
aws iam delete-policy --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy
```

## 🎓 Conclusion

This project successfully demonstrates the deployment of a cloud-native 2048 game application on **AWS EKS** with production-grade architecture. By leveraging modern DevOps tools and AWS managed services, we achieved:

**Key Achievements:**

- Zero-downtime deployment using Kubernetes rolling updates.
- Automatic load distribution across multiple pods via ALB.
- Scalable infrastructure ready to handle increased traffic.
- Secure container registry with AWS ECR and IAM-based access.
- Infrastructure as Code implementation using YAML manifests.

## 🏆 Final Outcome
This project showcases expertise in containerization, Kubernetes orchestration, AWS cloud services, and production-grade deployment strategies - making it a valuable addition to any DevOps portfolio.

*Built with ❤️ by **Naman Pandey** | DevOps Engineer | Cloud-Native Architecture 🚀*

