#!/usr/bin/env node

// seed demo quiz data for 2 canvas courses: CT216 Software Engineering & CT213 Computer Systems
// creates notes, chunks, quiz questions, and quiz cards for the demo user

import postgres from 'postgres';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

const DEMO_USER_ID = '549afd7a-01fd-4e1e-8637-29452401c2f2'; // semyon.fox@gmail.com

// canvas course IDs from actual enrollment
const CT216 = { courseId: 44269, name: 'CT216 Software Engineering I' };
const CT213 = { courseId: 44267, name: 'CT213 Computer Systems & Organization' };

// realistic note content derived from course topics
const COURSE_DATA = [
  {
    course: CT216,
    notes: [
      {
        title: 'Requirements Engineering & Use Cases',
        content: `# Requirements Engineering

## What are Requirements?

Requirements define what a system should do (functional) and how well it should do it (non-functional). Requirements engineering is the process of eliciting, analyzing, documenting, and validating these requirements.

### Types of Requirements

- **Functional Requirements**: Describe what the system should do. Example: "The system shall allow users to upload PDF documents."
- **Non-functional Requirements**: Constraints on how the system operates. Categories include performance, security, usability, reliability.

### Requirements Elicitation Techniques

1. **Interviews**: Structured or unstructured conversations with stakeholders
2. **Surveys/Questionnaires**: Gather data from large groups
3. **Observation**: Watch users in their working environment
4. **Document Analysis**: Review existing documentation and systems
5. **Prototyping**: Build quick mockups to validate understanding

## Use Case Diagrams

Use case diagrams show the interactions between actors and the system. They consist of:
- **Actors**: External entities that interact with the system (stick figures)
- **Use Cases**: Functions the system performs (ovals)
- **System Boundary**: Rectangle enclosing use cases
- **Relationships**: Include, extend, and generalization

### Include vs Extend

- **Include**: A use case that is always executed as part of another use case. Notation: <<include>>
- **Extend**: A use case that is optionally executed. Notation: <<extend>>

### Writing Use Case Specifications

A use case specification includes:
1. Use case name and ID
2. Primary actor
3. Preconditions
4. Main success scenario (step by step)
5. Alternative flows
6. Postconditions`,
        chunks: [
          {
            text: `Requirements define what a system should do (functional) and how well it should do it (non-functional). Requirements engineering is the process of eliciting, analyzing, documenting, and validating these requirements. Functional Requirements describe what the system should do. Non-functional Requirements are constraints on how the system operates, including performance, security, usability, and reliability.`,
            section: 'Types of Requirements',
          },
          {
            text: `Requirements elicitation techniques include: Interviews (structured or unstructured conversations with stakeholders), Surveys/Questionnaires (gather data from large groups), Observation (watch users in their working environment), Document Analysis (review existing documentation), and Prototyping (build quick mockups to validate understanding).`,
            section: 'Elicitation Techniques',
          },
          {
            text: `Use case diagrams show interactions between actors and the system. They consist of Actors (external entities, shown as stick figures), Use Cases (system functions, shown as ovals), System Boundary (rectangle enclosing use cases), and Relationships (include, extend, generalization). Include means a use case is always executed as part of another. Extend means a use case is optionally executed.`,
            section: 'Use Case Diagrams',
          },
          {
            text: `A use case specification includes: use case name and ID, primary actor, preconditions, main success scenario (step by step), alternative flows, and postconditions. Use case specifications provide detailed descriptions of how actors interact with the system to achieve a specific goal.`,
            section: 'Use Case Specifications',
          },
        ],
      },
      {
        title: 'Agile & Scrum Methodology',
        content: `# Agile Software Development

## The Agile Manifesto (2001)

The four core values:
1. **Individuals and interactions** over processes and tools
2. **Working software** over comprehensive documentation
3. **Customer collaboration** over contract negotiation
4. **Responding to change** over following a plan

## Scrum Framework

Scrum is an agile framework for managing work. Key roles:
- **Product Owner**: Manages the product backlog, represents stakeholders
- **Scrum Master**: Facilitates the process, removes impediments
- **Development Team**: Self-organizing, cross-functional (3-9 members)

### Scrum Events

1. **Sprint**: Time-boxed iteration (typically 2-4 weeks)
2. **Sprint Planning**: Team selects items from backlog for the sprint
3. **Daily Standup**: 15-minute daily sync (What did I do? What will I do? Any blockers?)
4. **Sprint Review**: Demo working software to stakeholders
5. **Sprint Retrospective**: Team reflects on process improvements

### Scrum Artifacts

- **Product Backlog**: Ordered list of everything needed in the product
- **Sprint Backlog**: Items selected for current sprint + plan
- **Increment**: Sum of all completed backlog items

## User Stories

Format: "As a [role], I want [feature], so that [benefit]"

### INVEST Criteria for Good User Stories
- **I**ndependent
- **N**egotiable
- **V**aluable
- **E**stimable
- **S**mall
- **T**estable

### Story Points & Velocity

Story points estimate relative effort using Fibonacci sequence (1, 2, 3, 5, 8, 13, 21).
Velocity = total story points completed per sprint. Used for forecasting.`,
        chunks: [
          {
            text: `The Agile Manifesto (2001) defines four core values: Individuals and interactions over processes and tools, Working software over comprehensive documentation, Customer collaboration over contract negotiation, and Responding to change over following a plan. These values guide agile software development practices.`,
            section: 'Agile Manifesto',
          },
          {
            text: `Scrum is an agile framework with three key roles: Product Owner (manages the product backlog, represents stakeholders), Scrum Master (facilitates the process, removes impediments), and Development Team (self-organizing, cross-functional, 3-9 members). The team works in time-boxed iterations called Sprints, typically 2-4 weeks long.`,
            section: 'Scrum Roles',
          },
          {
            text: `Scrum events include: Sprint Planning (team selects items from backlog), Daily Standup (15-minute daily sync covering what was done, what will be done, and blockers), Sprint Review (demo working software to stakeholders), and Sprint Retrospective (team reflects on process improvements). Each sprint produces a potentially shippable increment.`,
            section: 'Scrum Events',
          },
          {
            text: `User stories follow the format: "As a [role], I want [feature], so that [benefit]". Good user stories follow the INVEST criteria: Independent, Negotiable, Valuable, Estimable, Small, and Testable. Story points estimate relative effort using the Fibonacci sequence (1, 2, 3, 5, 8, 13, 21). Velocity is the total story points completed per sprint.`,
            section: 'User Stories',
          },
        ],
      },
      {
        title: 'Software Testing & Quality Assurance',
        content: `# Software Testing

## Testing Levels

1. **Unit Testing**: Test individual components/functions in isolation
2. **Integration Testing**: Test interactions between components
3. **System Testing**: Test the complete integrated system
4. **Acceptance Testing**: Validate the system meets business requirements

## Testing Techniques

### Black-Box Testing
Tests based on requirements without knowledge of internal structure.
- **Equivalence Partitioning**: Divide inputs into groups that should behave the same
- **Boundary Value Analysis**: Test at the edges of equivalence classes
- **Decision Table Testing**: Systematic testing of combinations of conditions

### White-Box Testing
Tests based on knowledge of internal code structure.
- **Statement Coverage**: Every statement executed at least once
- **Branch Coverage**: Every branch (true/false) executed at least once
- **Path Coverage**: Every possible execution path tested

## Test-Driven Development (TDD)

The TDD cycle:
1. **Red**: Write a failing test
2. **Green**: Write the minimum code to pass the test
3. **Refactor**: Improve code quality while keeping tests green

Benefits: Better design, higher confidence in code, living documentation.`,
        chunks: [
          {
            text: `Software testing levels include: Unit Testing (test individual components in isolation), Integration Testing (test interactions between components), System Testing (test the complete integrated system), and Acceptance Testing (validate the system meets business requirements). Each level catches different types of defects.`,
            section: 'Testing Levels',
          },
          {
            text: `Black-box testing is based on requirements without knowledge of internal structure. Techniques include: Equivalence Partitioning (divide inputs into groups that should behave the same), Boundary Value Analysis (test at edges of equivalence classes), and Decision Table Testing (systematic testing of condition combinations). White-box testing uses knowledge of internal code structure with Statement Coverage, Branch Coverage, and Path Coverage.`,
            section: 'Testing Techniques',
          },
          {
            text: `Test-Driven Development (TDD) follows the Red-Green-Refactor cycle: Red (write a failing test), Green (write minimum code to pass the test), and Refactor (improve code quality while keeping tests green). Benefits include better design, higher confidence in code, and living documentation that serves as a specification.`,
            section: 'Test-Driven Development',
          },
        ],
      },
    ],
  },
  {
    course: CT213,
    notes: [
      {
        title: 'CPU Architecture & Instruction Sets',
        content: `# CPU Architecture

## Von Neumann Architecture

The Von Neumann architecture consists of:
- **Central Processing Unit (CPU)**: ALU + Control Unit
- **Memory**: Stores both data and instructions
- **Input/Output**: Communication with external devices
- **Bus System**: Data bus, address bus, control bus

### The Fetch-Decode-Execute Cycle

1. **Fetch**: Load instruction from memory (address in PC) into IR
2. **Decode**: Control unit interprets the instruction
3. **Execute**: ALU performs the operation
4. **Store**: Write results back to register or memory

## Instruction Set Architecture (ISA)

### RISC vs CISC

| Feature | RISC | CISC |
|---------|------|------|
| Instructions | Simple, fixed length | Complex, variable length |
| Execution | Single cycle | Multiple cycles |
| Registers | Many (32+) | Few (8-16) |
| Addressing | Load/Store | Memory-to-memory |
| Examples | ARM, RISC-V, MIPS | x86, x86-64 |

### Addressing Modes

- **Immediate**: Operand is part of the instruction (ADD R1, #5)
- **Register**: Operand is in a register (ADD R1, R2)
- **Direct**: Operand address is in the instruction (LOAD R1, [0x1000])
- **Indirect**: Address of the operand's address is given
- **Indexed**: Base address + offset (LOAD R1, [R2 + 4])`,
        chunks: [
          {
            text: `The Von Neumann architecture consists of: Central Processing Unit (CPU) containing the ALU and Control Unit, Memory that stores both data and instructions (stored-program concept), Input/Output for communication with external devices, and a Bus System with data bus, address bus, and control bus connecting all components.`,
            section: 'Von Neumann Architecture',
          },
          {
            text: `The Fetch-Decode-Execute cycle: Fetch loads the instruction from memory (address in Program Counter) into the Instruction Register. Decode has the control unit interpret the instruction. Execute has the ALU perform the operation. Store writes results back to a register or memory. The PC is then incremented to point to the next instruction.`,
            section: 'Fetch-Decode-Execute',
          },
          {
            text: `RISC (Reduced Instruction Set Computer) uses simple, fixed-length instructions executing in a single cycle with many registers (32+) and load/store addressing. Examples include ARM, RISC-V, and MIPS. CISC (Complex Instruction Set Computer) uses complex, variable-length instructions that may take multiple cycles with fewer registers (8-16) and memory-to-memory addressing. Examples include x86 and x86-64.`,
            section: 'RISC vs CISC',
          },
          {
            text: `Addressing modes determine how operands are specified: Immediate (operand is part of the instruction, e.g., ADD R1, #5), Register (operand is in a register, e.g., ADD R1, R2), Direct (operand address is in the instruction, e.g., LOAD R1, [0x1000]), Indirect (address of the operand's address is given), and Indexed (base address plus offset, e.g., LOAD R1, [R2 + 4]).`,
            section: 'Addressing Modes',
          },
        ],
      },
      {
        title: 'Memory Hierarchy & Cache',
        content: `# Memory Hierarchy

## The Memory Pyramid

From fastest/smallest to slowest/largest:
1. **Registers**: ~1 ns, bytes (inside CPU)
2. **L1 Cache**: ~2 ns, 32-64 KB (per core)
3. **L2 Cache**: ~7 ns, 256 KB-1 MB (per core)
4. **L3 Cache**: ~15 ns, 2-32 MB (shared)
5. **Main Memory (RAM)**: ~100 ns, 4-64 GB
6. **SSD/HDD**: ~10 µs - 10 ms, TB scale

## Cache Organization

### Cache Mapping Strategies

1. **Direct Mapped**: Each memory block maps to exactly one cache line
   - Fast lookup, but high conflict miss rate
   - Line = (Block address) mod (Number of cache lines)

2. **Fully Associative**: Any block can go in any cache line
   - Lowest miss rate, but expensive to search
   - Requires searching all lines (comparators)

3. **Set Associative**: Compromise - N-way sets
   - Set = (Block address) mod (Number of sets)
   - Block can go in any line within its set
   - 2-way, 4-way, 8-way are common

### Cache Replacement Policies
- **LRU** (Least Recently Used): Replace the line unused longest
- **FIFO** (First In First Out): Replace the oldest line
- **Random**: Replace a randomly chosen line

### Cache Write Policies
- **Write-through**: Write to both cache and memory simultaneously
- **Write-back**: Write only to cache; write to memory on eviction (dirty bit)`,
        chunks: [
          {
            text: `The memory hierarchy from fastest/smallest to slowest/largest: Registers (~1 ns, bytes, inside CPU), L1 Cache (~2 ns, 32-64 KB per core), L2 Cache (~7 ns, 256 KB-1 MB per core), L3 Cache (~15 ns, 2-32 MB shared), Main Memory/RAM (~100 ns, 4-64 GB), and SSD/HDD (~10 µs to 10 ms, TB scale). This hierarchy exploits temporal and spatial locality.`,
            section: 'Memory Pyramid',
          },
          {
            text: `Cache mapping strategies: Direct Mapped (each memory block maps to exactly one cache line, fast lookup but high conflict miss rate), Fully Associative (any block can go in any cache line, lowest miss rate but expensive to search), and Set Associative (N-way compromise where blocks map to a set but can go in any line within that set; 2-way, 4-way, 8-way are common).`,
            section: 'Cache Mapping',
          },
          {
            text: `Cache replacement policies include LRU (Least Recently Used, replace the line unused longest), FIFO (First In First Out, replace the oldest line), and Random (replace a randomly chosen line). Cache write policies: Write-through writes to both cache and memory simultaneously. Write-back writes only to cache and writes to memory on eviction using a dirty bit.`,
            section: 'Cache Policies',
          },
        ],
      },
    ],
  },
];

// quiz questions for each chunk - ONE question per bloom level per chunk (unique constraint)
const QUIZ_QUESTIONS = {
  // CT216 - Requirements Engineering
  'Types of Requirements': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which of the following is a non-functional requirement?',
      options: [
        { text: 'The system shall allow users to upload PDF documents', is_correct: false },
        { text: 'The system shall respond to queries within 2 seconds', is_correct: true },
        { text: 'The system shall display a list of all notes', is_correct: false },
        { text: 'The system shall send email notifications', is_correct: false },
      ],
      answer: 'The system shall respond to queries within 2 seconds',
      explanation: 'Response time is a performance constraint (non-functional). The other options describe what the system does (functional requirements).',
    },
    {
      type: 'mcq',
      bloom: 2,
      text: 'Why is the distinction between functional and non-functional requirements important in requirements engineering?',
      options: [
        { text: 'Non-functional requirements are always optional', is_correct: false },
        { text: 'They are tested differently and affect different architectural decisions', is_correct: true },
        { text: 'Functional requirements are only for developers', is_correct: false },
        { text: 'Non-functional requirements cannot be measured', is_correct: false },
      ],
      answer: 'They are tested differently and affect different architectural decisions',
      explanation: 'Functional requirements drive feature implementation, while non-functional requirements (performance, security, scalability) shape architecture and infrastructure decisions. They also require different testing strategies.',
    },
  ],
  'Elicitation Techniques': [
    {
      type: 'mcq',
      bloom: 2,
      text: 'A requirements engineer wants to understand how users currently perform their tasks in their actual work environment. Which elicitation technique is most appropriate?',
      options: [
        { text: 'Interviews', is_correct: false },
        { text: 'Surveys', is_correct: false },
        { text: 'Observation', is_correct: true },
        { text: 'Document Analysis', is_correct: false },
      ],
      answer: 'Observation',
      explanation: 'Observation involves watching users in their working environment to understand how they actually perform tasks, which may differ from how they describe their work.',
    },
    {
      type: 'fill_in',
      bloom: 1,
      text: 'The technique of building quick mockups to validate understanding of requirements before full development is called _______.',
      options: null,
      answer: 'Prototyping',
      explanation: 'Prototyping involves creating quick, often low-fidelity mockups that stakeholders can interact with to validate that the requirements engineer has understood their needs correctly.',
    },
  ],
  'Use Case Diagrams': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'In a use case diagram, what does the <<include>> relationship indicate?',
      options: [
        { text: 'An optional behavior that may be triggered', is_correct: false },
        { text: 'A behavior that is always executed as part of another use case', is_correct: true },
        { text: 'A generalization between two actors', is_correct: false },
        { text: 'A dependency between two systems', is_correct: false },
      ],
      answer: 'A behavior that is always executed as part of another use case',
      explanation: 'The <<include>> relationship means the included use case is always executed when the base use case runs. <<extend>> is for optional behavior.',
    },
    {
      type: 'mcq',
      bloom: 3,
      text: 'In an online shopping system, "Process Payment" is always required when "Place Order" executes, but "Apply Discount Code" is optional. Which relationships should be used?',
      options: [
        { text: 'Place Order <<include>> Process Payment; Place Order <<include>> Apply Discount Code', is_correct: false },
        { text: 'Place Order <<extend>> Process Payment; Place Order <<extend>> Apply Discount Code', is_correct: false },
        { text: 'Place Order <<include>> Process Payment; Apply Discount Code <<extend>> Place Order', is_correct: true },
        { text: 'Process Payment <<include>> Place Order; Apply Discount Code <<include>> Place Order', is_correct: false },
      ],
      answer: 'Place Order <<include>> Process Payment; Apply Discount Code <<extend>> Place Order',
      explanation: 'Process Payment is mandatory (<<include>>). Apply Discount Code is optional (<<extend>>). Note that the extending use case points to the base use case.',
    },
  ],
  'Use Case Specifications': [
    {
      type: 'fill_in',
      bloom: 1,
      text: 'The conditions that must be true before a use case can begin are called _______.',
      options: null,
      answer: 'Preconditions',
      explanation: 'Preconditions define the state the system must be in before the use case can execute. Postconditions define the state after successful execution.',
    },
    {
      type: 'mcq',
      bloom: 2,
      text: 'What is the purpose of alternative flows in a use case specification?',
      options: [
        { text: 'To document the happy path of the use case', is_correct: false },
        { text: 'To describe how the system handles deviations from the main scenario', is_correct: true },
        { text: 'To list the actors involved', is_correct: false },
        { text: 'To define postconditions', is_correct: false },
      ],
      answer: 'To describe how the system handles deviations from the main scenario',
      explanation: 'Alternative flows document what happens when the main success scenario cannot be followed, such as error handling, edge cases, or optional steps.',
    },
  ],
  // CT216 - Agile
  'Agile Manifesto': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which of the following is one of the four values of the Agile Manifesto?',
      options: [
        { text: 'Comprehensive documentation over working software', is_correct: false },
        { text: 'Following a plan over responding to change', is_correct: false },
        { text: 'Customer collaboration over contract negotiation', is_correct: true },
        { text: 'Processes and tools over individuals and interactions', is_correct: false },
      ],
      answer: 'Customer collaboration over contract negotiation',
      explanation: 'The Agile Manifesto values customer collaboration over contract negotiation. The other options are reversed versions of the actual values.',
    },
    {
      type: 'true_false',
      bloom: 2,
      text: 'The Agile Manifesto states that documentation and planning have no value in software development.',
      options: [
        { text: 'True', is_correct: false },
        { text: 'False', is_correct: true },
      ],
      answer: 'False',
      explanation: 'The Agile Manifesto values the items on the left MORE than items on the right, but acknowledges that items on the right still have value. It is about priorities, not elimination.',
    },
  ],
  'Scrum Roles': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Who is responsible for managing the product backlog in Scrum?',
      options: [
        { text: 'Scrum Master', is_correct: false },
        { text: 'Development Team', is_correct: false },
        { text: 'Product Owner', is_correct: true },
        { text: 'Project Manager', is_correct: false },
      ],
      answer: 'Product Owner',
      explanation: 'The Product Owner manages the product backlog and represents stakeholders. The Scrum Master facilitates the process, and the Development Team is self-organizing.',
    },
    {
      type: 'mcq',
      bloom: 3,
      text: 'A stakeholder wants to add a new feature mid-sprint that would affect the current sprint goal. What should happen according to Scrum?',
      options: [
        { text: 'The developer should immediately start working on it', is_correct: false },
        { text: 'The Product Owner adds it to the product backlog for a future sprint', is_correct: true },
        { text: 'The Scrum Master cancels the current sprint', is_correct: false },
        { text: 'The team votes on whether to add it', is_correct: false },
      ],
      answer: 'The Product Owner adds it to the product backlog for a future sprint',
      explanation: 'In Scrum, the sprint backlog should not change once the sprint starts. New requests go to the product backlog and are prioritized by the Product Owner for future sprints.',
    },
  ],
  'Scrum Events': [
    {
      type: 'mcq',
      bloom: 2,
      text: 'During which Scrum event does the team reflect on what went well and what could be improved?',
      options: [
        { text: 'Sprint Planning', is_correct: false },
        { text: 'Sprint Review', is_correct: false },
        { text: 'Sprint Retrospective', is_correct: true },
        { text: 'Daily Standup', is_correct: false },
      ],
      answer: 'Sprint Retrospective',
      explanation: 'The Sprint Retrospective focuses on process improvement. The Sprint Review is for demoing working software to stakeholders. Sprint Planning selects work for the sprint.',
    },
    {
      type: 'mcq',
      bloom: 3,
      text: 'A team member says "I finished the login API yesterday, today I will work on the dashboard, and I am blocked by the missing database credentials." In which Scrum event would this be shared?',
      options: [
        { text: 'Sprint Planning', is_correct: false },
        { text: 'Daily Standup', is_correct: true },
        { text: 'Sprint Review', is_correct: false },
        { text: 'Sprint Retrospective', is_correct: false },
      ],
      answer: 'Daily Standup',
      explanation: 'The Daily Standup (daily scrum) is a 15-minute sync where team members share what they did, what they will do, and any blockers.',
    },
  ],
  'User Stories': [
    {
      type: 'fill_in',
      bloom: 1,
      text: 'The user story format is: "As a _______, I want [feature], so that [benefit]".',
      options: null,
      answer: 'role',
      explanation: 'User stories follow the format "As a [role], I want [feature], so that [benefit]" to capture who needs the feature, what they need, and why.',
    },
    {
      type: 'mcq',
      bloom: 2,
      text: 'What does the "I" in the INVEST criteria for user stories stand for?',
      options: [
        { text: 'Incremental', is_correct: false },
        { text: 'Independent', is_correct: true },
        { text: 'Iterative', is_correct: false },
        { text: 'Integrated', is_correct: false },
      ],
      answer: 'Independent',
      explanation: 'INVEST stands for Independent, Negotiable, Valuable, Estimable, Small, and Testable. Independent means stories should not depend on each other.',
    },
  ],
  // CT216 - Testing
  'Testing Levels': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which testing level verifies that the system meets business requirements?',
      options: [
        { text: 'Unit Testing', is_correct: false },
        { text: 'Integration Testing', is_correct: false },
        { text: 'System Testing', is_correct: false },
        { text: 'Acceptance Testing', is_correct: true },
      ],
      answer: 'Acceptance Testing',
      explanation: 'Acceptance testing validates that the complete system meets business requirements and is typically performed by or with the customer.',
    },
    {
      type: 'true_false',
      bloom: 2,
      text: 'Integration testing focuses on testing individual components in isolation.',
      options: [
        { text: 'True', is_correct: false },
        { text: 'False', is_correct: true },
      ],
      answer: 'False',
      explanation: 'Integration testing focuses on testing interactions between components. Unit testing is the level that tests individual components in isolation.',
    },
  ],
  'Testing Techniques': [
    {
      type: 'mcq',
      bloom: 2,
      text: 'A tester divides input values for an age field into groups: under 0 (invalid), 0-17 (minor), 18-120 (adult), over 120 (invalid). Which technique is being used?',
      options: [
        { text: 'Boundary Value Analysis', is_correct: false },
        { text: 'Equivalence Partitioning', is_correct: true },
        { text: 'Decision Table Testing', is_correct: false },
        { text: 'Statement Coverage', is_correct: false },
      ],
      answer: 'Equivalence Partitioning',
      explanation: 'Equivalence Partitioning divides inputs into groups (partitions) where all values in a group should produce the same behavior.',
    },
    {
      type: 'mcq',
      bloom: 4,
      text: 'A test suite achieves 100% statement coverage but misses a bug in an if-else branch. What type of coverage would have caught this?',
      options: [
        { text: 'Statement Coverage', is_correct: false },
        { text: 'Function Coverage', is_correct: false },
        { text: 'Branch Coverage', is_correct: true },
        { text: 'Line Coverage', is_correct: false },
      ],
      answer: 'Branch Coverage',
      explanation: 'Statement coverage only requires each statement to execute once. Branch coverage requires both true and false outcomes of every decision point, catching bugs in untested branches.',
    },
  ],
  'Test-Driven Development': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'What is the correct order of the TDD cycle?',
      options: [
        { text: 'Green, Red, Refactor', is_correct: false },
        { text: 'Red, Green, Refactor', is_correct: true },
        { text: 'Refactor, Red, Green', is_correct: false },
        { text: 'Red, Refactor, Green', is_correct: false },
      ],
      answer: 'Red, Green, Refactor',
      explanation: 'TDD follows Red (write failing test), Green (write minimum code to pass), Refactor (improve code quality while keeping tests green).',
    },
    {
      type: 'mcq',
      bloom: 3,
      text: 'You need to add a feature to calculate the total price with tax. Following TDD, what do you do first?',
      options: [
        { text: 'Write the calculateTotalWithTax function', is_correct: false },
        { text: 'Write a test that calls calculateTotalWithTax and asserts the expected result', is_correct: true },
        { text: 'Refactor the existing price calculation code', is_correct: false },
        { text: 'Create the database schema for tax rates', is_correct: false },
      ],
      answer: 'Write a test that calls calculateTotalWithTax and asserts the expected result',
      explanation: 'In TDD, you always start with a failing test (Red step) before writing any implementation code. This ensures you have a clear specification of the expected behavior.',
    },
  ],
  // CT213 - CPU
  'Von Neumann Architecture': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which component of the Von Neumann architecture performs arithmetic and logical operations?',
      options: [
        { text: 'Control Unit', is_correct: false },
        { text: 'ALU (Arithmetic Logic Unit)', is_correct: true },
        { text: 'Memory Unit', is_correct: false },
        { text: 'I/O Controller', is_correct: false },
      ],
      answer: 'ALU (Arithmetic Logic Unit)',
      explanation: 'The ALU (Arithmetic Logic Unit) performs all arithmetic (add, subtract, etc.) and logical (AND, OR, NOT) operations within the CPU.',
    },
    {
      type: 'true_false',
      bloom: 2,
      text: 'In the Von Neumann architecture, data and instructions are stored in separate memory units.',
      options: [
        { text: 'True', is_correct: false },
        { text: 'False', is_correct: true },
      ],
      answer: 'False',
      explanation: 'The Von Neumann architecture uses a single memory for both data and instructions (the stored-program concept). Harvard architecture uses separate memories.',
    },
  ],
  'Fetch-Decode-Execute': [
    {
      type: 'mcq',
      bloom: 2,
      text: 'During which phase of the fetch-decode-execute cycle does the control unit interpret the instruction?',
      options: [
        { text: 'Fetch', is_correct: false },
        { text: 'Decode', is_correct: true },
        { text: 'Execute', is_correct: false },
        { text: 'Store', is_correct: false },
      ],
      answer: 'Decode',
      explanation: 'The Decode phase is where the control unit interprets the instruction loaded into the Instruction Register.',
    },
    {
      type: 'fill_in',
      bloom: 1,
      text: 'The register that holds the address of the next instruction to be fetched is called the _______ Counter.',
      options: null,
      answer: 'Program',
      explanation: 'The Program Counter (PC) holds the memory address of the next instruction to be fetched. After each fetch, the PC is incremented.',
    },
  ],
  'RISC vs CISC': [
    {
      type: 'mcq',
      bloom: 2,
      text: 'Which of the following is a characteristic of RISC architecture?',
      options: [
        { text: 'Complex, variable-length instructions', is_correct: false },
        { text: 'Few registers (8-16)', is_correct: false },
        { text: 'Single-cycle instruction execution', is_correct: true },
        { text: 'Memory-to-memory addressing', is_correct: false },
      ],
      answer: 'Single-cycle instruction execution',
      explanation: 'RISC uses simple, fixed-length instructions that execute in a single cycle. It has many registers (32+) and uses load/store addressing.',
    },
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which processor architecture family does ARM belong to?',
      options: [
        { text: 'CISC', is_correct: false },
        { text: 'RISC', is_correct: true },
        { text: 'VLIW', is_correct: false },
        { text: 'Hybrid', is_correct: false },
      ],
      answer: 'RISC',
      explanation: 'ARM is a RISC architecture, widely used in mobile devices. x86/x86-64 are CISC architectures.',
    },
  ],
  'Addressing Modes': [
    {
      type: 'mcq',
      bloom: 3,
      text: 'Given the instruction "ADD R1, #5", what addressing mode is used for the second operand?',
      options: [
        { text: 'Register', is_correct: false },
        { text: 'Direct', is_correct: false },
        { text: 'Immediate', is_correct: true },
        { text: 'Indexed', is_correct: false },
      ],
      answer: 'Immediate',
      explanation: 'The #5 indicates immediate addressing, where the operand value (5) is embedded directly in the instruction itself.',
    },
    {
      type: 'fill_in',
      bloom: 2,
      text: 'In _______ addressing mode, the operand address is calculated by adding a base register value to an offset.',
      options: null,
      answer: 'Indexed',
      explanation: 'Indexed addressing computes the effective address by adding a base register value to an offset (e.g., LOAD R1, [R2 + 4]). Commonly used for array access.',
    },
  ],
  // CT213 - Memory
  'Memory Pyramid': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which level of the memory hierarchy has the fastest access time?',
      options: [
        { text: 'L1 Cache', is_correct: false },
        { text: 'Main Memory (RAM)', is_correct: false },
        { text: 'Registers', is_correct: true },
        { text: 'L2 Cache', is_correct: false },
      ],
      answer: 'Registers',
      explanation: 'Registers are the fastest storage (~1 ns) located directly inside the CPU. Hierarchy: Registers > L1 > L2 > L3 > RAM > SSD/HDD.',
    },
    {
      type: 'true_false',
      bloom: 2,
      text: 'L3 cache is typically shared among all cores in a multi-core processor.',
      options: [
        { text: 'True', is_correct: true },
        { text: 'False', is_correct: false },
      ],
      answer: 'True',
      explanation: 'L3 cache (2-32 MB) is typically shared among all cores, while L1 and L2 caches are per-core.',
    },
  ],
  'Cache Mapping': [
    {
      type: 'mcq',
      bloom: 2,
      text: 'Which cache mapping strategy offers the best balance between miss rate and lookup speed?',
      options: [
        { text: 'Direct Mapped', is_correct: false },
        { text: 'Fully Associative', is_correct: false },
        { text: 'Set Associative', is_correct: true },
        { text: 'Random Mapped', is_correct: false },
      ],
      answer: 'Set Associative',
      explanation: 'Set Associative mapping is a compromise: reduces conflict misses vs direct mapped while being cheaper than fully associative. 4-way and 8-way are common.',
    },
    {
      type: 'mcq',
      bloom: 3,
      text: 'In a direct-mapped cache with 8 lines, which cache line would memory block 13 map to?',
      options: [
        { text: 'Line 3', is_correct: false },
        { text: 'Line 5', is_correct: true },
        { text: 'Line 1', is_correct: false },
        { text: 'Line 6', is_correct: false },
      ],
      answer: 'Line 5',
      explanation: 'In direct-mapped cache: Block address mod Number of cache lines = 13 mod 8 = 5. So block 13 maps to cache line 5.',
    },
  ],
  'Cache Policies': [
    {
      type: 'mcq',
      bloom: 1,
      text: 'Which cache replacement policy evicts the entry that has not been used for the longest time?',
      options: [
        { text: 'FIFO', is_correct: false },
        { text: 'LRU', is_correct: true },
        { text: 'Random', is_correct: false },
        { text: 'MRU', is_correct: false },
      ],
      answer: 'LRU',
      explanation: 'LRU (Least Recently Used) replaces the cache line that has not been accessed for the longest time, based on temporal locality.',
    },
    {
      type: 'mcq',
      bloom: 4,
      text: 'A system uses write-back caching. When a cache line is evicted, which mechanism determines whether it needs to be written to main memory?',
      options: [
        { text: 'The replacement policy', is_correct: false },
        { text: 'The dirty bit', is_correct: true },
        { text: 'The valid bit', is_correct: false },
        { text: 'The tag field', is_correct: false },
      ],
      answer: 'The dirty bit',
      explanation: 'Write-back caching uses a dirty bit to track modifications. On eviction, only dirty lines need to be written back, reducing memory bus traffic.',
    },
  ],
};

async function seed() {
  console.log('seeding demo quiz data...\n');

  // verify user exists
  const [user] = await sql`SELECT user_id, email FROM app.login WHERE user_id = ${DEMO_USER_ID}::uuid`;
  if (!user) {
    console.error('demo user not found:', DEMO_USER_ID);
    process.exit(1);
  }
  console.log('user:', user.email);

  let totalNotes = 0;
  let totalChunks = 0;
  let totalQuestions = 0;
  let totalCards = 0;

  for (const courseData of COURSE_DATA) {
    const { course, notes } = courseData;
    console.log(`\n--- ${course.name} (canvas id: ${course.courseId}) ---`);

    // create a folder note for the course (or reuse existing one)
    let folderId;
    const [existingFolder] = await sql`
      SELECT note_id FROM app.notes
      WHERE user_id = ${DEMO_USER_ID}::uuid AND canvas_course_id = ${course.courseId} AND is_folder = true
      LIMIT 1
    `;
    if (existingFolder) {
      folderId = existingFolder.note_id;
      console.log('  reusing existing folder:', folderId);
    } else {
      folderId = randomUUID();
      await sql`
        INSERT INTO app.notes (note_id, user_id, title, is_folder, deleted, pinned, shared, canvas_course_id, canvas_academic_year)
        VALUES (${folderId}::uuid, ${DEMO_USER_ID}::uuid, ${course.name}, true, 0, 0, 0, ${course.courseId}, '2025-2026')
      `;
    }

    // create tree_item for the folder
    const folderTreeId = randomUUID();
    await sql`
      INSERT INTO app.tree_items (id, user_id, note_id, parent_id, is_expanded)
      VALUES (${folderTreeId}::uuid, ${DEMO_USER_ID}::uuid, ${folderId}::uuid, null, true)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log('  folder:', course.name);

    for (const note of notes) {
      const noteId = randomUUID();

      // create the note
      await sql`
        INSERT INTO app.notes (note_id, user_id, title, content, extracted_text, is_folder, deleted, pinned, shared, canvas_course_id, canvas_academic_year)
        VALUES (
          ${noteId}::uuid, ${DEMO_USER_ID}::uuid, ${note.title}, ${note.content}, ${note.content},
          false, 0, 0, 0, ${course.courseId}, '2025-2026'
        )
        ON CONFLICT (note_id) DO NOTHING
      `;
      totalNotes++;

      // create tree_item for the note (under course folder)
      // parent_id references notes.note_id, so use the folder's note_id
      const noteTreeId = randomUUID();
      await sql`
        INSERT INTO app.tree_items (id, user_id, note_id, parent_id, is_expanded)
        VALUES (${noteTreeId}::uuid, ${DEMO_USER_ID}::uuid, ${noteId}::uuid, ${folderId}::uuid, false)
        ON CONFLICT (id) DO NOTHING
      `;
      console.log('  note:', note.title);

      for (const chunk of note.chunks) {
        const chunkId = randomUUID();

        // create chunk
        await sql`
          INSERT INTO app.chunks (id, document_id, user_id, text, section)
          VALUES (${chunkId}::uuid, ${noteId}::uuid, ${DEMO_USER_ID}::uuid, ${chunk.text}, ${chunk.section})
          ON CONFLICT (id) DO NOTHING
        `;
        totalChunks++;

        // create quiz questions for this chunk
        const questions = QUIZ_QUESTIONS[chunk.section] || [];
        for (const q of questions) {
          const questionId = randomUUID();

          await sql`
            INSERT INTO app.quiz_questions (id, user_id, note_id, chunk_id, question_type, bloom_level, question_text, options, correct_answer, explanation)
            VALUES (
              ${questionId}::uuid, ${DEMO_USER_ID}::uuid, ${noteId}::uuid, ${chunkId}::uuid,
              ${q.type}, ${q.bloom}, ${q.text},
              ${q.options ? JSON.stringify(q.options) : null}::jsonb,
              ${q.answer}, ${q.explanation}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          totalQuestions++;

          // create quiz card (some due now, some in the future for variety)
          const cardId = randomUUID();
          const isDueNow = Math.random() > 0.3; // 70% due now for the demo
          const due = isDueNow
            ? new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
            : new Date(Date.now() + 1000 * 60 * 60 * 24 * Math.floor(Math.random() * 7)); // 1-7 days from now

          await sql`
            INSERT INTO app.quiz_cards (id, user_id, question_id, state, due)
            VALUES (${cardId}::uuid, ${DEMO_USER_ID}::uuid, ${questionId}::uuid, 'new', ${due})
            ON CONFLICT (id) DO NOTHING
          `;
          totalCards++;
        }
      }
    }
  }

  // create user_streaks entry if not exists
  await sql`
    INSERT INTO app.user_streaks (user_id, current_streak, longest_streak, total_review_days, streak_milestones)
    VALUES (${DEMO_USER_ID}::uuid, 3, 5, 8, ${JSON.stringify([{ days: 3, reached_at: new Date().toISOString() }])}::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      longest_streak = EXCLUDED.longest_streak
  `;

  console.log('\n=== seed complete ===');
  console.log(`notes:     ${totalNotes}`);
  console.log(`chunks:    ${totalChunks}`);
  console.log(`questions: ${totalQuestions}`);
  console.log(`cards:     ${totalCards}`);

  // verify the dashboard query works
  const courses = await sql`
    SELECT
      n.canvas_course_id,
      MAX(n.title) as course_name,
      COUNT(DISTINCT qc.id)::int as total_cards,
      COUNT(DISTINCT qc.id) FILTER (WHERE qc.due <= now())::int as due_count
    FROM app.quiz_questions qq
    JOIN app.quiz_cards qc ON qc.question_id = qq.id
    JOIN app.notes n ON qq.note_id = n.note_id
    WHERE qq.user_id = ${DEMO_USER_ID}::uuid
      AND n.canvas_course_id IS NOT NULL
    GROUP BY n.canvas_course_id
    ORDER BY due_count DESC
  `;

  console.log('\n=== course dashboard verification ===');
  for (const c of courses) {
    console.log(`  ${c.course_name} (id: ${c.canvas_course_id}): ${c.total_cards} cards, ${c.due_count} due now`);
  }

  await sql.end();
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
