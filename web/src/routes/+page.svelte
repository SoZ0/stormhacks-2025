<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chatbot with Collapsible Sidebar</title>
    <style>
        body {
            display: flex;
            margin: 0;
            font-family: sans-serif;
            overflow-x: hidden; /* prevent horizontal scroll */
        }

        /* sidebar styles */
        .sidebar {
            width: 250px;
            background-color: #f0f0f0;
            padding: 20px;
            box-shadow: 2px 0 5px rgba(0,0,0,0.1);
            height: 100vh;
            overflow-y: auto;
            position: fixed;
            left: 0;
            top: 0;
            transition: transform 0.3s ease;
        }

        /* collapsed state */
        .sidebar.collapsed {
            transform: translateX(-100%);
        }

        /* main content */
        .main-content {
            flex-grow: 1;
            padding: 20px;
            margin-left: 250px;
            transition: margin-left 0.3s ease;
            width: 100%;
        }

        /* when sidebar collapsed */
        .main-content.expanded {
            margin-left: 0;
        }

        /* sidebar toggle button */
        .toggle-btn {
            position: fixed;
            top: 15px;
            left: 15px;
            background-color: #007bff;
            color: white;
            border: none;
            padding: 10px 12px;
            border-radius: 5px;
            cursor: pointer;
            z-index: 1000;
        }

        .toggle-btn:hover {
            background-color: #0056b3;
        }

        /* chat list styling */
        .chat-list ul {
            list-style: none;
            padding: 0;
        }

        .chat-list li {
            margin-bottom: 10px;
            padding: 8px;
            background-color: #e0e0e0;
            border-radius: 5px;
            cursor: pointer;
        }

        .chat-list li:hover {
            background-color: #d0d0d0;
        }

        .new-chat-button {
            display: block;
            width: 100%;
            padding: 10px;
            background-color: #007bff;
            color: white;
            text-align: center;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
        }

        .new-chat-button:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body>
    <button class="toggle-btn" id="toggleSidebar">☰</button>

    <div class="sidebar" id="sidebar">
        <button class="new-chat-button">New Chat</button>
        <div class="chat-list">
            <h3>Recent Chats</h3>
            <ul>
                <li>Chat with Agent A</li>
                <li>Chat with Support</li>
                <li>General Inquiry</li>
            </ul>
        </div>
    </div>

    <div class="main-content" id="mainContent">
        <h1>Welcome to the Chatbot</h1>
        <p>Select a chat from the sidebar or start a new one.</p>
    </div>

    <script>
        const toggleBtn = document.getElementById('toggleSidebar');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');

        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    </script>
</body>
</html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chatbot with Sidebar</title>
    <style>
        body {
            display: flex; /* Use flexbox for layout */
            margin: 0;
            font-family: sans-serif;
        }
        .sidebar {
            width: 250px; /* Adjust width as needed */
            background-color: #f0f0f0;
            padding: 20px;
            box-shadow: 2px 0 5px rgba(0,0,0,0.1);
            height: 100vh; /* Full viewport height */
            overflow-y: auto; /* Enable scrolling if content exceeds height */
        }
        .main-content {
            flex-grow: 1; /* Takes up remaining space */
            padding: 20px;
        }
        .chat-list ul {
            list-style: none;
            padding: 0;
        }
        .chat-list li {
            margin-bottom: 10px;
            padding: 8px;
            background-color: #e0e0e0;
            border-radius: 5px;
            cursor: pointer;
        }
        .chat-list li:hover {
            background-color: #d0d0d0;
        }
        .new-chat-button {
            display: block;
            width: 100%;
            padding: 10px;
            background-color: #007bff;
            color: white;
            text-align: center;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
        }
        .new-chat-button:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <button class="new-chat-button">New Chat</button>
        <div class="chat-list">
            <h3>Recent Chats</h3>
            <ul>
                <li>Chat with Agent A</li>
                <li>Chat with Support</li>
                <li>General Inquiry</li>
            </ul>
        </div>
    </div>
    <div class="main-content">
        <h1>Welcome to the Chatbot</h1>
        <p>Select a chat from the sidebar or start a new one.</p>
        <!-- Chat window content would go here -->
    </div>
</body>