# Glossary

This file defines technical terms used in the Socsboard project.

## A

### Adapter Pattern
A software design pattern that allows the interface of an existing class to be used as another interface. In our project, it lets us switch between different backend services (like Firebase or AWS) without changing the main application's code.

### API (Application Programming Interface)
A set of rules and tools for building software applications. It specifies how software components should interact. For example, our web application communicates with the recommender service through an API.

## B

### Backend
The part of the application that is not visible to the user. It handles the server-side logic, data storage, and other core functions. In our project, this includes the **Backend Adapters** and the **Recommender** service.

### Backend Adapter
A component that connects our **Frontend** application to a specific set of **Backend** services (like Firebase or AWS).

## F

### Frontend
The part of the application that users interact with directly. This is the visual part of the app, including the user interface (UI). In our project, this is the **Web Application**.

## M

### Monorepo
A single repository that holds the code for multiple projects. This makes it easier to manage and share code between them. Our project uses a monorepo to store the web app, backend adapters, and other services.

## N

### Next.js
A popular framework for building modern web applications. It provides features that make development faster and easier, such as server-side rendering and file-based routing.

## P

### pnpm workspaces
A feature of the `pnpm` package manager that allows you to manage multiple projects within a single **Monorepo**.

## R

### REST API
A type of **API** that follows a set of constraints for building web services. It's a common way for different parts of an application to communicate with each other over the internet.
