
# Rasidify Tablet POS – Development Prompt

We already have a **production-ready Mobile POS application** that contains the complete POS functionality.

### Existing Production Mobile POS

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-mobile
```

This project contains the existing production implementation, including POS functionality, barcode scanning, printing, printer settings, LAN printing, Bluetooth printing, Sunmi support, and other existing functionality.

### Tablet POS UI Reference

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-tablet\Tablet POS UI
```

The UI folder contains the complete design/reference for the new Tablet POS.

---

## Main Objective

Create a **completely separate new project** for the Rasidify Tablet POS and POS terminals.

The new project should:

* Use the existing production Mobile POS project as the **functional reference**
* Use the provided Tablet POS UI as the **visual and UX reference**
* Port/reimplement the existing POS functionality into the new project
* Maintain the same business behavior and calculations
* Support the required barcode and printing functionality
* Provide a professional, native-feeling tablet/POS experience

---

# VERY IMPORTANT – DO NOT MODIFY THE PRODUCTION PROJECT

The following project is production-ready:

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-mobile
```

**Do not make any changes to this project.**

Treat it strictly as a **read-only reference/source project**.

Do not:

* Modify files
* Refactor code
* Rename anything
* Delete anything
* Change dependencies
* Change existing business logic
* Change existing APIs
* Change barcode implementation
* Change printing implementation
* Change printer settings
* Change configuration

Any required changes or adaptations must be implemented **only in the new Tablet POS project**.

---

# First Review Both Projects

Before implementing anything, carefully review both locations.

### Production Mobile POS

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-mobile
```

Understand the existing implementation and functionality.

Pay particular attention to:

* Existing POS functionality
* Business logic
* Product handling
* Cart behavior
* Pricing
* Discounts
* Tax calculations
* Payments
* Order processing
* Barcode implementation
* Printer implementation
* LAN printing
* Bluetooth printing
* Sunmi printing
* Receipt printing
* Device/printer settings
* API communication
* Local storage
* Authentication
* Error handling
* Any other functionality already implemented

### Tablet UI

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-tablet\Tablet POS UI
```

Review **all available UI screens and designs**.

The UI folder is the source of truth for the visual direction of the Tablet POS.

Do not invent a different UI unnecessarily.

---

# Important: Functional Reference vs UI Reference

Use the two projects for different purposes:

### Mobile POS

**Source of functional behavior**

Understand how the existing production application works and reproduce that functionality in the new project.

### Tablet POS UI

**Source of visual design and user experience**

Follow the provided designs for the new Tablet POS.

The final application should combine both correctly.

---

# Do Not Simply Scale the Mobile App

The new application is specifically for:

* Tablets
* Touch-screen POS terminals
* Larger POS displays
* Landscape POS environments

It should **not look like a mobile application enlarged to tablet size**.

It should feel like a purpose-built professional POS application.

---

# Native & Professional UI

The most important UI requirement is:

> **The Tablet POS must have a professional, native-feeling POS experience.**

The interface should be optimized for:

* Touch interaction
* Large screens
* Landscape usage
* Cashier workflow
* Fast product selection
* Fast cart interaction
* Fast checkout
* Fast payment
* Minimal unnecessary navigation
* Large and clear touch targets
* Clear totals
* Easy scanning
* Easy printing

Avoid making it feel like a website inside an application.

Avoid unnecessarily small controls.

Avoid excessive animations.

Avoid unnecessary UI elements that slow down cashier operations.

---

# UI Implementation

Use the supplied Tablet POS UI as the primary visual reference.

Carefully reproduce:

* Layouts
* Spacing
* Typography
* Colors
* Icons
* Buttons
* Product presentation
* Cart presentation
* Dialogs
* Forms
* Lists
* Tables
* Navigation
* States
* Empty states
* Loading states
* Error states
* Responsive behavior

Do not create arbitrary new screens or UI patterns when the required design already exists in the provided UI.

If something is not explicitly represented in the UI, use the existing application behavior and maintain the same design language.

---

# Responsive Tablet Experience

The application should work properly across different tablet and POS terminal screen sizes.

Support different:

* Resolutions
* Aspect ratios
* Screen sizes
* Landscape layouts

Avoid hard-coded layouts that only work on one screen size.

The UI should adapt naturally while maintaining the intended design.

---

# Existing Functionality Must Be Preserved

Where functionality already exists in the production Mobile POS, reproduce the same behavior in the new application.

Do not create different business rules.

Pay particular attention to:

* Pricing
* Quantity
* Discounts
* Taxes
* Totals
* Payment calculations
* Order processing
* Receipt data
* Customer handling
* Product behavior
* Barcode behavior

The Tablet POS should remain functionally consistent with the existing Rasidify POS.

---

# Barcode

The production Mobile POS already has barcode functionality.

Review the existing implementation and reproduce it in the new Tablet POS.

The barcode experience should be fast and reliable for POS usage.

Do not unnecessarily redesign or change the existing barcode business behavior.

---

# Printing

Printing is a critical requirement.

Review the production Mobile POS printing implementation carefully and reproduce the required functionality in the new project.

Existing printing functionality includes:

* LAN/network printers
* Bluetooth printers
* Sunmi printers/devices
* Receipt printing
* Printer configuration/settings
* Printer connection handling
* Printing errors/retry behavior where already supported

Do not change the production implementation.

If platform-specific adaptation is required for the Tablet POS, implement it only inside the new project.

---

# Functional Parity

The new Tablet POS should eventually provide the same important POS capabilities available in the production Mobile POS.

Do not assume a predefined feature list.

Instead:

**Review the production project and identify the complete existing functionality.**

Then reproduce the required functionality in the new Tablet POS.

Nothing important from the existing POS workflow should be accidentally omitted.

---

# Code Reuse

Before copying code, understand how the existing implementation works.

Prefer clean reuse/reimplementation of existing functionality where appropriate.

If code can be safely reused without creating unwanted dependency between the production Mobile POS and the new Tablet POS, evaluate that option.

However:

**Never introduce changes into the production project just to make code reuse easier.**

The production project must remain untouched.

---

# Development Process

Follow this sequence:

### 1. Review

First inspect:

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-mobile
```

and:

```text
D:\SHAHZAD\Rasidify 2.0\rasidify-pos-tablet\Tablet POS UI
```

Understand the complete functionality and UI before implementation.

### 2. Create New Project

Create the Tablet POS as a completely separate application/project.

### 3. Implement UI

Implement the supplied Tablet POS UI accurately.

### 4. Implement Functionality

Port/reimplement the functionality from the production Mobile POS.

### 5. Integrate Hardware Features

Ensure barcode and supported printer functionality work correctly on the target tablet/POS devices.

### 6. Test

Test the complete POS workflow and hardware functionality.

---

# Quality Expectations

The final application should be:

* Production-ready
* Stable
* Fast
* Responsive
* Touch optimized
* Professional
* Native feeling
* Easy for cashiers to use
* Consistent with Rasidify POS
* Compatible with the provided UI design
* Functionally consistent with the existing production POS

---

# Final Rules

1. **Create a completely separate Tablet POS project.**
2. **Never modify the production Mobile POS project.**
3. **Use the Mobile POS as the functional reference.**
4. **Use the Tablet POS UI folder as the visual/UX reference.**
5. **Review all existing screens and functionality before implementation.**
6. **Do not invent page names, screen structures, or architecture when they already exist in the provided project/UI.**
7. **Do not simply scale the mobile UI.**
8. **Make the experience feel native and purpose-built for tablets and POS terminals.**
9. **Preserve existing business logic and POS behavior.**
10. **Port barcode and printer functionality carefully, including LAN, Bluetooth and Sunmi where applicable.**
11. **Keep the new project independent and maintainable.**
12. **Do not make any changes to the production project for convenience.**
