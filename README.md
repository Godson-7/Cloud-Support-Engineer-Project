# AWS Furniture Inventory Management System

## Project Overview
A multi-shop furniture inventory system built on AWS serverless architecture providing real-time inventory tracking, sales processing, and role-based access control for shop attendants and administrators.

## Business Challenge
A furniture retailer with 3 physical locations (Raymakossa, Tarso, Market) needed a unified inventory system with:
- Real-time stock tracking across all shops
- Role-based access for shop attendants
- Sales recording with audit trails
- Mobile-friendly interface for shop floors

## Technical Solution
**Serverless Microservices Architecture** using:
- **Authentication**: AWS Cognito with multi-user pool strategy
- **API Layer**: API Gateway with Cognito Authorizer
- **Business Logic**: Lambda Functions (Node.js 20.x)
- **Database**: DynamoDB with per-shop table isolation
- **Frontend**: S3 Static Hosting with CloudFront

## Key Features
 **Multi-shop Inventory Management** - Real-time sync across locations  
 **Role-Based Access Control** - Admin vs Shop Attendant permissions  
 **Sales Processing** - Transaction recording with stock deduction  
 **Attendance Tracking** - Shop attendant clock-in/out system  
 **Mobile Responsive** - Works on tablets and phones  
 **Cost Optimized** - Serverless, pay-per-use model  


## AWS Services Used
- **Compute**: AWS Lambda
- **Database**: Amazon DynamoDB
- **Authentication**: Amazon Cognito
- **API Management**: Amazon API Gateway
- **Storage**: Amazon S3 + CloudFront
- **Monitoring**: Amazon CloudWatch
- **Infrastructure as Code**: Terraform (optional)

## Performance Metrics
- **API Response Time**: <200ms average
- **Product Load Time**: <2 seconds
- **Concurrent Users**: Supports 50+ simultaneous shop attendants
- **Availability**: 99.9% uptime
- **Cost**: <$50/month for 3 shops

## Troubleshooting Guide
Common issues and solutions documented in [troubleshooting/](./troubleshooting/)

