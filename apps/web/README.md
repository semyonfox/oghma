# Web Application

This is the main [**Frontend**](glossary.md#frontend) application for Socsboard, built with [**Next.js
**](glossary.md#nextjs). It's what users see and interact with in their web browser.

For definitions of technical terms, please see the main project [**Glossary**](../../GLOSSARY.md).

## How It Works

This application is designed to be flexible. It doesn't directly connect to a database. Instead, it uses a special
design ([**Adapter Pattern**](glossary.md#adapter-pattern)) that allows it to use different services for handling data.

This means we can easily switch the [**Backend**](glossary.md#backend) between providers like Firebase or AWS.

## Configuration

You can choose which backend service to use by setting an environment variable in your configuration:

- `NEXT_PUBLIC_BACKEND_PROVIDER`: Set this to either `firebase` or `aws`.
