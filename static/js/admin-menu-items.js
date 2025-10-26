// Admin Menu Items Management JavaScript

function openAddMenuItemModal() {
    document.getElementById('modalTitle').textContent = 'Add Menu Item';
    document.getElementById('menuItemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('menuItemModal').classList.add('active');
}

function closeMenuItemModal() {
    document.getElementById('menuItemModal').classList.remove('active');
    document.getElementById('menuItemForm').reset();
}

function editMenuItem(itemId) {
    fetch(`/api/menu-items/${itemId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const item = data.item;
                document.getElementById('modalTitle').textContent = 'Edit Menu Item';
                document.getElementById('itemId').value = item.id;
                document.getElementById('itemTitle').value = item.title;
                document.getElementById('itemDescription').value = item.description;
                document.getElementById('itemIcon').value = item.icon;
                document.getElementById('itemRoute').value = item.route;
                document.getElementById('itemOrder').value = item.display_order;
                document.getElementById('menuItemModal').classList.add('active');
            } else {
                alert('Error: ' + (data.error || 'Failed to load menu item'));
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to load menu item');
        });
}

function saveMenuItem(event) {
    event.preventDefault();

    const itemId = document.getElementById('itemId').value;
    const data = {
        title: document.getElementById('itemTitle').value,
        description: document.getElementById('itemDescription').value,
        icon: document.getElementById('itemIcon').value,
        route: document.getElementById('itemRoute').value,
        display_order: parseInt(document.getElementById('itemOrder').value) || 0
    };

    const url = itemId ? `/api/menu-items/${itemId}` : '/api/menu-items';
    const method = itemId ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            closeMenuItemModal();
            location.reload();
        } else {
            alert('Error: ' + (result.error || 'Failed to save menu item'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to save menu item');
    });
}

function deleteMenuItem(itemId) {
    if (!confirm('Are you sure you want to delete this menu item? This action cannot be undone.')) {
        return;
    }

    fetch(`/api/menu-items/${itemId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            // Remove the row from the table immediately
            const row = document.querySelector(`tr[data-id="${itemId}"]`);
            if (row) {
                row.remove();
            }
            alert('Menu item deleted successfully');
        } else {
            alert('Error: ' + (result.error || 'Failed to delete menu item'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to delete menu item');
    });
}

// Close modal when clicking outside
document.addEventListener('click', (event) => {
    const modal = document.getElementById('menuItemModal');
    if (event.target === modal) {
        closeMenuItemModal();
    }
});
