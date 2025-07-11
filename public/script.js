// Global variables
let currentUser = null;
let authToken = null;
let socket = null;
let currentChatUser = null;
let currentPostId = null;
let allPosts = []; // Store all posts for search functionality
let filteredPosts = []; // Store filtered posts
let isSubmitting = false; // Global flag to prevent multiple submissions

// Helper function to set loading state
function setLoadingState(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
        const originalText = button.innerHTML;
        button.setAttribute('data-original-text', originalText);
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Verifying...';
    } else {
        button.disabled = false;
        button.classList.remove('loading');
        // Restore original text
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.innerHTML = originalText;
            button.removeAttribute('data-original-text');
        } else {
            // Fallback to default text based on button type
            if (button.classList.contains('btn-primary')) {
                button.innerHTML = 'Submit';
            } else if (button.classList.contains('btn-success')) {
                button.innerHTML = 'Create Post';
            } else if (button.classList.contains('btn-info')) {
                button.innerHTML = 'Update Profile';
            } else if (button.classList.contains('btn-warning')) {
                button.innerHTML = 'Request Machinery';
            } else if (button.classList.contains('btn-secondary')) {
                button.innerHTML = 'Post Machinery';
            }
        }
    }
}

// Helper function to get submit button from form
function getSubmitButton(form) {
    return form.querySelector('button[type="submit"]') || form.querySelector('.btn-primary') || form.querySelector('.btn-success');
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadPlatformStats();
    loadFarmingTips();
    
    // Add page visibility change listener for better socket management
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible' && currentUser) {
            // Page became visible, check socket connection
            if (!socket || socket.disconnected) {
                console.log('Page became visible, reconnecting socket...');
                initializeSocket();
            }
        }
    });
    
    // Add beforeunload listener to clean up socket
    window.addEventListener('beforeunload', function() {
        if (socket) {
            socket.disconnect();
        }
    });
});

// Authentication functions
function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        fetchUserProfile();
        showApp();
        initializeSocket();
    } else {
        showAuth();
    }
}

function showAuth() {
    document.getElementById('authSection').classList.remove('d-none');
    document.getElementById('appSection').classList.add('d-none');
    hideNavItems();
}

function showApp() {
    document.getElementById('authSection').classList.add('d-none');
    document.getElementById('appSection').classList.remove('d-none');
    showNavItems();
    showHome();
    loadPosts();
}

function showNavItems() {
    document.getElementById('navHome').classList.remove('d-none');
    document.getElementById('navMessages').classList.remove('d-none');
    document.getElementById('navWishlist').classList.remove('d-none');
    document.getElementById('navMachinery').classList.remove('d-none');
    document.getElementById('navProfile').classList.remove('d-none');
    document.getElementById('navLogout').classList.remove('d-none');
    document.getElementById('navReports').classList.remove('d-none');
    
    // Show admin nav only for admin users (you can add admin check logic here)
    if (currentUser && currentUser.is_admin) {
        document.getElementById('navAdmin').classList.remove('d-none');
    }
    
    document.getElementById('bottomNav').style.display = 'flex';
}

function hideNavItems() {
    document.getElementById('navHome').classList.add('d-none');
    document.getElementById('navMessages').classList.add('d-none');
    document.getElementById('navWishlist').classList.add('d-none');
    document.getElementById('navMachinery').classList.add('d-none');
    document.getElementById('navProfile').classList.add('d-none');
    document.getElementById('navLogout').classList.add('d-none');
    document.getElementById('navReports').classList.add('d-none');
    document.getElementById('navAdmin').classList.add('d-none');
    document.getElementById('bottomNav').style.display = 'none';
}

function showLogin() {
    document.getElementById('loginForm').classList.remove('d-none');
    document.getElementById('registerForm').classList.add('d-none');
    document.getElementById('otpForm').classList.add('d-none');
}

function showRegister() {
    document.getElementById('loginForm').classList.add('d-none');
    document.getElementById('registerForm').classList.remove('d-none');
    document.getElementById('otpForm').classList.add('d-none');
}

function showOTPForm() {
    document.getElementById('loginForm').classList.add('d-none');
    document.getElementById('registerForm').classList.add('d-none');
    document.getElementById('otpForm').classList.remove('d-none');
}

// API functions
async function apiCall(endpoint, method = 'GET', data = null, isFormData = false) {
    const options = {
        method,
        headers: {}
    };

    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (data) {
        if (isFormData) {
            options.body = data;
        } else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(data);
        }
    }

    try {
        const response = await fetch(`/api${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return result;
    } catch (error) {
        console.error(`API call failed (${method} ${endpoint}):`, error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error. Please check your connection.');
        }
        throw error;
    }
}

// Authentication handlers
async function register(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const formData = {
        name: document.getElementById('registerName').value,
        email: document.getElementById('registerEmail').value,
        password: document.getElementById('registerPassword').value,
        phone: document.getElementById('registerPhone').value,
        location: document.getElementById('registerLocation').value
    };

    try {
        const result = await apiCall('/register', 'POST', formData);
        localStorage.setItem('pendingUserId', result.userId);
        showAlert('Registration successful! Please check your email for OTP.', 'success');
        showOTPForm();
    } catch (error) {
        console.error('Registration failed:', error);
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

async function verifyOTP(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const userId = localStorage.getItem('pendingUserId');
    const otp = document.getElementById('otpCode').value;

    try {
        await apiCall('/verify-otp', 'POST', { userId, otp });
        localStorage.removeItem('pendingUserId');
        showAlert('Email verified successfully! Please login.', 'success');
        showLogin();
    } catch (error) {
        console.error('OTP verification failed:', error);
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

async function login(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const formData = {
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
    };

    try {
        const result = await apiCall('/login', 'POST', formData);
        authToken = result.token;
        currentUser = result.user;
        localStorage.setItem('authToken', authToken);
        showApp();
        await fetchUserProfile(); // Ensure profile is loaded
        updateNavbarProfileImage(currentUser.profile_image); // Update navbar image
        loadPlatformStats();
        loadPosts();
        initializeSocket();
    } catch (error) {
        console.error('Login failed:', error);
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

function logout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    if (socket) {
        socket.disconnect();
    }
    showAuth();
}

// Navigation functions
function showHome() {
    hideAllSections();
    document.getElementById('homeSection').classList.remove('d-none');
    loadPosts();
}

function showMessages() {
    hideAllSections();
    document.getElementById('messagesSection').classList.remove('d-none');
    
    // Ensure socket is connected for messaging
    if (currentUser && (!socket || socket.disconnected)) {
        initializeSocket();
    }
    
    loadConversations();
    updateMessagesBadge();
}

function showWishlist() {
    hideAllSections();
    document.getElementById('wishlistSection').classList.remove('d-none');
    loadWishlist();
}

function showMachinery() {
    hideAllSections();
    document.getElementById('machinerySection').classList.remove('d-none');
    loadMachineryRequests();
    loadMachineryPosts();
}

function showProfile() {
    hideAllSections();
    document.getElementById('profileSection').classList.remove('d-none');
    loadProfile();
}

function showReports() {
    hideAllSections();
    document.getElementById('reportsSection').classList.remove('d-none');
    loadUserReports();
}

async function loadUserReports() {
    try {
        const reports = await apiCall('/reports');
        displayUserReports(reports);
    } catch (error) {
        document.getElementById('userReportsContainer').innerHTML = '<div class="alert alert-danger">Failed to load reports.</div>';
    }
}

function displayUserReports(reports) {
    const container = document.getElementById('userReportsContainer');
    container.innerHTML = '';
    if (!reports || reports.length === 0) {
        container.innerHTML = '<div class="text-center text-muted">No reports submitted yet.</div>';
        return;
    }
    const statusMap = {
        'pending': 'Pending',
        'Pending': 'Pending',
        'resolved': 'Resolved',
        'Resolved': 'Resolved',
        'rejected': 'Rejected',
        'Rejected': 'Rejected',
        'reviewed': 'Reviewed',
        'Reviewed': 'Reviewed'
    };
    const table = document.createElement('table');
    table.className = 'table table-bordered table-hover';
    table.innerHTML = `
        <thead class="table-success">
            <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
                <th>Reply</th>
                <th>Date</th>
            </tr>
        </thead>
        <tbody>
            ${reports.map(r => `
                <tr>
                    <td>${r.id}</td>
                    <td>${r.type}</td>
                    <td>${r.description}</td>
                    <td>${statusMap[r.status] !== undefined ? statusMap[r.status] : (r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '')}</td>
                    <td>${r.reply || ''}</td>
                    <td>${r.created_at ? formatDate(r.created_at) : ''}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

function hideAllSections() {
    document.getElementById('homeSection').classList.add('d-none');
    document.getElementById('messagesSection').classList.add('d-none');
    document.getElementById('wishlistSection').classList.add('d-none');
    document.getElementById('machinerySection').classList.add('d-none');
    document.getElementById('profileSection').classList.add('d-none');
    document.getElementById('reportsSection').classList.add('d-none');
    document.getElementById('adminSection').classList.add('d-none');
}

// Search functionality
function handleSearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const filterValue = document.getElementById('searchFilter').value;
    
    // Filter posts based on search term and filter
    filteredPosts = allPosts.filter(post => {
        const matchesSearch = !searchTerm || 
            post.crop_name.toLowerCase().includes(searchTerm) ||
            (post.location && post.location.toLowerCase().includes(searchTerm)) ||
            (post.user_name && post.user_name.toLowerCase().includes(searchTerm));
        
        const matchesFilter = filterValue === 'all' || 
            (filterValue === 'available' && !post.sold) ||
            (filterValue === 'sold' && post.sold);
        
        return matchesSearch && matchesFilter;
    });
    
    // Display filtered posts
    displayPosts(filteredPosts);
    
    // Show search results count
    const resultsCount = document.getElementById('searchResultsCount');
    if (resultsCount) {
        resultsCount.textContent = `Showing ${filteredPosts.length} of ${allPosts.length} posts`;
    }
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchFilter').value = 'all';
    filteredPosts = allPosts;
    displayPosts(allPosts);
    
    // Clear search results count
    const resultsCount = document.getElementById('searchResultsCount');
    if (resultsCount) {
        resultsCount.textContent = '';
    }
}

// Posts functions
async function loadPosts() {
    try {
        const posts = await apiCall('/posts');
        allPosts = posts; // Store all posts for search functionality
        filteredPosts = posts; // Initially show all posts
        displayPosts(posts);
    } catch (error) {
        console.error('Failed to load posts:', error);
    }
}

function displayPosts(posts) {
    const container = document.getElementById('postsContainer');
    container.innerHTML = '';

    if (posts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-search fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No posts found</h5>
                <p class="text-muted">Try adjusting your search criteria</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const postElement = createPostElement(post);
        container.appendChild(postElement);
    });
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'card mb-4 border-0 shadow-sm post-card';
    const isOwner = currentUser && post.user_id == currentUser.id;
    const statusLabel = post.sold ? '<span class="badge bg-danger ms-2">Sold</span>' : '<span class="badge bg-success ms-2">Available</span>';
    const statusButton = isOwner ? `<button class="btn btn-sm btn-outline-${post.sold ? 'success' : 'danger'} ms-2" onclick="toggleSoldStatus(${post.id}, ${!post.sold})">Mark as ${post.sold ? 'Available' : 'Sold'}</button>` : '';
    const imageHtml = post.image ? 
        `<img src="${getImageUrl(post.image)}" class="post-image w-100" alt="Crop image">` : '';
    div.innerHTML = `
        <div class="card-body">
            <div class="d-flex align-items-center mb-3">
                <img src="${post.user_image ? getImageUrl(post.user_image) : 'https://via.placeholder.com/40'}"
                     class="profile-img me-3" alt="Profile">
                <div>
                    <h6 class="mb-0">${post.user_name}</h6>
                    <small class="text-muted">${formatDate(post.created_at)}</small>
                </div>
                <div class="ms-auto">
                    <button class="btn btn-sm btn-outline-danger" onclick="showReportModal(${post.id}, ${post.user_id})">
                        <i class="fas fa-flag"></i>
                    </button>
                </div>
            </div>
            ${imageHtml}
            <h5 class="text-success mt-3">${post.crop_name} ${statusLabel} ${statusButton}</h5>
            <div class="crop-info">
                <span class="crop-info-item">
                    <i class="fas fa-map-marker-alt me-1"></i>${post.area} acres
                </span>
                <span class="crop-info-item">
                    <i class="fas fa-phone me-1"></i>${post.phone}
                </span>
                ${post.location ? `<span class="crop-info-item">
                    <i class="fas fa-location-dot me-1"></i>${post.location}
                </span>` : ''}
                ${post.price ? `<span class="crop-info-item">
                    <i class="fas fa-dollar-sign me-1"></i>₹${post.price}
                </span>` : ''}
                ${post.quantity ? `<span class="crop-info-item">
                    <i class="fas fa-weight me-1"></i>${post.quantity}
                </span>` : ''}
            </div>
            ${post.description ? `<p class="text-muted mt-2">${post.description}</p>` : ''}
            <div class="post-actions">
                <button class="action-btn like-btn" onclick="toggleLike(${post.id}, this)">
                    <i class="fas fa-thumbs-up me-1"></i>
                    <span>${post.likes_count || 0}</span>
                </button>
                <button class="action-btn" onclick="showComments(${post.id})">
                    <i class="fas fa-comment me-1"></i>
                    <span>${post.comments_count || 0}</span>
                </button>
                <button class="action-btn wishlist-btn" onclick="toggleWishlist(${post.id}, this)">
                    <i class="fas fa-heart me-1"></i>
                    Wishlist
                </button>
                <button class="action-btn" onclick="startChat(${post.user_id})">
                    <i class="fas fa-message me-1"></i>
                    Message
                </button>
            </div>
        </div>
    `;
    return div;
}

window.toggleSoldStatus = async function(postId, sold) {
    try {
        await apiCall(`/posts/${postId}/sold`, 'PUT', { sold });
        showAlert('Status updated!', 'success');
        loadPosts();
    } catch (e) {
        showAlert('Failed to update status', 'danger');
    }
};

async function createPost(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const formData = new FormData();
    formData.append('crop_name', document.getElementById('cropName').value);
    formData.append('area', document.getElementById('cropArea').value);
    formData.append('phone', document.getElementById('cropPhone').value);
    formData.append('location', document.getElementById('cropLocation').value);
    formData.append('price', document.getElementById('cropPrice').value);
    formData.append('quantity', document.getElementById('cropQuantity').value);
    formData.append('description', document.getElementById('cropDescription').value);
    
    const imageFile = document.getElementById('cropImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const result = await apiCall('/posts', 'POST', formData, true);
        showAlert('Post created successfully!', 'success');
        event.target.reset();
        
        // Optimize: Load posts in background and update UI immediately
        loadPosts().then(() => {
            loadPlatformStats();
            clearSearch();
        }).catch(error => {
            console.error('Background load failed:', error);
        });
        
    } catch (error) {
        console.error('Failed to create post:', error);
        showAlert(`Failed to create post: ${error.message}`, 'danger');
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

async function toggleLike(postId, button) {
    if (isSubmitting) return;
    isSubmitting = true;
    
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i><span>...</span>';
    
    try {
        const result = await apiCall(`/posts/${postId}/like`, 'POST');
        const icon = button.querySelector('i');
        const span = button.querySelector('span');
        
        if (result.liked) {
            button.classList.add('active');
            button.classList.add('like-btn');
            icon.className = 'fas fa-thumbs-up me-1';
        } else {
            button.classList.remove('active');
            icon.className = 'far fa-thumbs-up me-1';
        }
        
        // Update count properly - use the count from server response
        if (result.likeCount !== undefined) {
            span.textContent = result.likeCount;
        } else {
            // Fallback: increment/decrement current count
            const currentCount = parseInt(span.textContent) || 0;
            span.textContent = result.liked ? currentCount + 1 : Math.max(0, currentCount - 1);
        }
        
    } catch (error) {
        console.error('Failed to toggle like:', error);
        // Restore original button state on error
        button.innerHTML = originalHTML;
    } finally {
        isSubmitting = false;
        button.disabled = false;
    }
}

async function toggleWishlist(postId, button) {
    if (isSubmitting) return;
    isSubmitting = true;
    
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>';
    
    try {
        const result = await apiCall(`/wishlist/${postId}`, 'POST');
        const icon = button.querySelector('i');
        
        if (result.inWishlist) {
            button.classList.add('active');
            button.classList.add('wishlist-btn');
            icon.className = 'fas fa-heart me-1';
        } else {
            button.classList.remove('active');
            icon.className = 'far fa-heart me-1';
        }
        
        showAlert(result.message, 'success');
    } catch (error) {
        console.error('Failed to toggle wishlist:', error);
    } finally {
        isSubmitting = false;
        button.disabled = false;
    }
}

// Comments functions
async function showComments(postId) {
    currentPostId = postId;
    try {
        const comments = await apiCall(`/posts/${postId}/comments`);
        displayComments(comments);
        new bootstrap.Modal(document.getElementById('commentsModal')).show();
    } catch (error) {
        console.error('Failed to load comments:', error);
    }
}

function displayComments(comments) {
    const container = document.getElementById('commentsContainer');
    container.innerHTML = '';

    if (comments.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No comments yet.</p>';
        return;
    }

    comments.forEach(comment => {
        const div = document.createElement('div');
        div.className = 'mb-3 p-3 bg-light rounded';
        div.innerHTML = `
            <div class="d-flex align-items-center mb-2">
                <img src="${comment.user_image ? getImageUrl(comment.user_image) : 'https://via.placeholder.com/30'}" 
                     class="rounded-circle me-2" width="30" height="30" alt="Profile">
                <strong>${comment.user_name}</strong>
                <small class="text-muted ms-auto">${formatDate(comment.created_at)}</small>
            </div>
            <p class="mb-0">${comment.comment}</p>
        `;
        container.appendChild(div);
    });
}

async function addComment(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const comment = document.getElementById('commentInput').value.trim();
    if (!comment) {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
        return;
    }

    try {
        await apiCall(`/posts/${currentPostId}/comments`, 'POST', { comment });
        document.getElementById('commentInput').value = '';
        showComments(currentPostId); // Reload comments
        showAlert('Comment added successfully!', 'success');
    } catch (error) {
        console.error('Failed to add comment:', error);
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

// Wishlist functions
async function loadWishlist() {
    try {
        const wishlist = await apiCall('/wishlist');
        displayWishlist(wishlist);
    } catch (error) {
        console.error('Failed to load wishlist:', error);
    }
}

function displayWishlist(wishlist) {
    const container = document.getElementById('wishlistContainer');
    container.innerHTML = '';

    if (wishlist.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-heart fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">Your wishlist is empty</h5>
                <p class="text-muted">Save posts you're interested in to see them here</p>
            </div>
        `;
        return;
    }

    const row = document.createElement('div');
    row.className = 'row';

    wishlist.forEach(post => {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-4';
        
        const imageHtml = post.image ? 
            `<img src="${getImageUrl(post.image)}" class="card-img-top post-image" alt="Crop image">` : '';
        
        col.innerHTML = `
            <div class="card border-0 shadow-sm">
                ${imageHtml}
                <div class="card-body">
                    <h5 class="card-title text-success">${post.crop_name}</h5>
                    <div class="crop-info mb-2">
                        <span class="crop-info-item">
                            <i class="fas fa-map-marker-alt me-1"></i>${post.area} acres
                        </span>
                        <span class="crop-info-item">
                            <i class="fas fa-phone me-1"></i>${post.phone}
                        </span>
                    </div>
                    <p class="text-muted small">By ${post.user_name}</p>
                    <div class="d-flex gap-2">
                        <button class="btn btn-success btn-sm" onclick="startChat(${post.user_id})">
                            <i class="fas fa-message me-1"></i>Message
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="toggleWishlist(${post.id}, this)">
                            <i class="fas fa-heart me-1"></i>Remove
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        row.appendChild(col);
    });

    container.appendChild(row);
}

// Profile functions
async function fetchUserProfile() {
    try {
        const profile = await apiCall('/profile');
        currentUser = { ...currentUser, ...profile };
        updateNavbarProfileImage(currentUser.profile_image);
        // Also update profile section if visible
        if (document.getElementById('profileSection') && !document.getElementById('profileSection').classList.contains('d-none')) {
            loadProfile();
        }
    } catch (error) {
        console.error('Failed to fetch user profile:', error);
    }
}

async function loadProfile() {
    try {
        const profile = await apiCall('/profile');
        
        document.getElementById('profileName').value = profile.name || '';
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profileLocation').value = profile.location || '';
        
        document.getElementById('currentProfileName').textContent = profile.name || 'User Name';
        document.getElementById('currentProfileEmail').textContent = profile.email || 'user@email.com';
        
        if (profile.profile_image) {
            document.getElementById('currentProfileImage').src = getImageUrl(profile.profile_image);
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

async function updateProfile(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const formData = new FormData();
    formData.append('name', document.getElementById('profileName').value);
    formData.append('phone', document.getElementById('profilePhone').value);
    formData.append('location', document.getElementById('profileLocation').value);
    
    const imageFile = document.getElementById('profileImage').files[0];
    if (imageFile) {
        formData.append('profile_image', imageFile);
    }

    try {
        await apiCall('/profile', 'PUT', formData, true);
        showAlert('Profile updated successfully!', 'success');
        loadProfile();
        await fetchUserProfile(); // Refresh navbar image
    } catch (error) {
        console.error('Failed to update profile:', error);
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

// --- Messaging functions (REWRITTEN) ---
function initializeSocket() {
    if (!currentUser) return;
    
    // Disconnect existing socket if any
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    try {
        socket = io({
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log('Socket connected:', socket.id);
            showAlert('Chat connected successfully!', 'success');
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showAlert('Chat connection failed. Please refresh the page.', 'warning');
        });
        
        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                // Server disconnected, try to reconnect
                socket.connect();
            }
        });
        
        socket.on('newMessage', (message) => {
            console.log('New message received:', message);
            if (
                currentChatUser &&
                (message.sender_id == currentChatUser && message.receiver_id == currentUser.id ||
                 message.sender_id == currentUser.id && message.receiver_id == currentChatUser)
            ) {
                displayMessage(message);
            }
            loadConversations();
            updateMessagesBadge();
        });
        
        socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            showAlert('Chat reconnected successfully!', 'success');
        });
        
    } catch (error) {
        console.error('Failed to initialize socket:', error);
        showAlert('Failed to connect to chat server. Please refresh the page.', 'danger');
    }
}

async function loadConversations() {
    try {
        const conversations = await apiCall('/conversations');
        displayConversations(conversations);
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

function displayConversations(conversations) {
    const container = document.getElementById('conversationsList');
    container.innerHTML = '';
    if (conversations.length === 0) {
        container.innerHTML = '<p class="text-center text-muted p-3">No conversations yet</p>';
        return;
    }
    conversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.onclick = (event) => openChat(conv.user_id, conv.name, event);
        div.innerHTML = `
            <div class="d-flex align-items-center">
                <img src="${conv.profile_image ? getImageUrl(conv.profile_image) : 'https://via.placeholder.com/40'}" 
                     class="profile-img me-3" alt="Profile">
                <div class="flex-grow-1">
                    <h6 class="mb-1">${conv.name}</h6>
                    <p class="mb-0 text-muted small">${conv.last_message || 'No messages yet'}</p>
                </div>
                <small class="text-muted">${conv.last_message_time ? formatDate(conv.last_message_time) : ''}</small>
            </div>
        `;
        container.appendChild(div);
    });
}

async function openChat(userId, userName, event = null) {
    currentChatUser = userId;
    document.getElementById('chatHeader').textContent = userName;
    document.getElementById('messageForm').classList.remove('d-none');
    // Highlight active conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    if (event && event.target) {
        event.target.closest('.conversation-item').classList.add('active');
    }
    try {
        const messages = await apiCall(`/messages/${userId}`);
        displayMessages(messages);
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    messages.forEach(message => {
        displayMessage(message);
    });
    container.scrollTop = container.scrollHeight;
}

function displayMessage(message) {
    const container = document.getElementById('messagesContainer');
    const isOwn = message.sender_id == currentUser.id;
    const div = document.createElement('div');
    div.className = `d-flex ${isOwn ? 'justify-content-end' : 'justify-content-start'} mb-2`;
    div.innerHTML = `
        <div class="message-bubble ${isOwn ? 'message-sent' : 'message-received'}">
            <p class="mb-1">${message.message}</p>
            <small class="opacity-75">${formatTime(message.created_at)}</small>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function sendMessage(event) {
    event.preventDefault();
    
    if (!currentUser || !currentChatUser) {
        showAlert('Please select a user to chat with.', 'warning');
        return;
    }
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) {
        isSubmitting = false;
        return;
    }
    
    // Disable send button temporarily
    const sendBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnContent = sendBtn ? sendBtn.innerHTML : '';
    
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    // Check socket connection
    if (!socket || socket.disconnected) {
        showAlert('Not connected to chat server. Trying to reconnect...', 'warning');
        initializeSocket();
        
        // Wait a bit and try again
        setTimeout(() => {
            if (socket && !socket.disconnected) {
                sendMessageToServer(message);
            } else {
                showAlert('Failed to connect to chat server. Please refresh the page.', 'danger');
                isSubmitting = false;
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = originalBtnContent;
                }
            }
        }, 2000);
    } else {
        sendMessageToServer(message);
    }
    
    // Clear input immediately for better UX
    messageInput.value = '';
}

function sendMessageToServer(message) {
    socket.emit('sendMessage', {
        senderId: currentUser.id,
        receiverId: currentChatUser,
        message: message
    });
    
    // Re-enable send button after a short delay
    setTimeout(() => {
        isSubmitting = false;
        const sendBtn = document.querySelector('#messageForm button[type="submit"]');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }, 1000);
}

function startChat(userId) {
    showMessages();
    // Find user name and open chat
    // This is simplified - in real app, you'd fetch user details
    setTimeout(() => {
        openChat(userId, 'User');
    }, 100);
}

// Report functions
function showReportModal(postId, userId) {
    currentPostId = postId;
    currentReportedUserId = userId;
    new bootstrap.Modal(document.getElementById('reportModal')).show();
}

async function submitReport(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const type = document.getElementById('reportType').value;
    const description = document.getElementById('reportDescription').value;
    
    try {
        await apiCall('/reports', 'POST', {
            reported_user_id: currentReportedUserId,
            post_id: currentPostId,
            type: type,
            description: description
        });
        
        showAlert('Report submitted successfully. We will review it shortly.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('reportModal')).hide();
        document.getElementById('reportModal').querySelector('form').reset();
    } catch (error) {
        console.error('Failed to submit report:', error);
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

// Utility functions
function getImageUrl(imagePath) {
    // If the image path is already a full URL (Cloudinary), return it as is
    if (imagePath && (imagePath.startsWith('http://') || imagePath.startsWith('https://'))) {
        return imagePath;
    }
    // If it's a local path, prepend the uploads directory
    return imagePath ? `/uploads/${imagePath}` : null;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 100px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// --- Notification Badge Logic ---
async function updateMessagesBadge() {
    if (!authToken || !currentUser) return;
    try {
        const response = await fetch('/api/messages/unread-count', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await response.json();
        const badge = document.getElementById('messagesBadge');
        if (result && result.unreadCount > 0) {
            badge.textContent = result.unreadCount;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    } catch (e) {}
}
setInterval(updateMessagesBadge, 10000);
document.addEventListener('DOMContentLoaded', updateMessagesBadge);

// Update navbar profile image
function updateNavbarProfileImage(profileImage) {
    const img = document.getElementById('navbarProfileImg');
    if (img) {
        img.src = profileImage ? getImageUrl(profileImage) : 'https://via.placeholder.com/32';
    }
}

async function loadPlatformStats() {
    try {
        const res = await fetch('/api/platform-stats');
        const stats = await res.json();
        const container = document.getElementById('platformStatsContainer');
        container.innerHTML = `
            <div class="col-3">
                <h4 class="text-success">${stats.farmers}</h4>
                <small class="text-muted">Farmers</small>
            </div>
            <div class="col-3">
                <h4 class="text-success">${stats.crops}</h4>
                <small class="text-muted">Crops</small>
            </div>
            <div class="col-3">
                <h4 class="text-success">${stats.trades}</h4>
                <small class="text-muted">Trades (Sold)</small>
            </div>
            <div class="col-3">
                <h4 class="text-success">${typeof stats.available !== 'undefined' ? stats.available : 0}</h4>
                <small class="text-muted">Available</small>
            </div>
        `;
    } catch (e) {
        // fallback or error message
    }
}

async function loadFarmingTips() {
    try {
        const res = await fetch('/api/farming-tips');
        const tips = await res.json();
        const container = document.getElementById('farmingTipsContainer');
        container.innerHTML = tips.map(tip => `
            <li class="mb-2">
                <i class="fas fa-check-circle text-success me-2"></i>
                ${tip.tip}
            </li>
        `).join('');
    } catch (e) {
        // fallback or error message
    }
}

// Machinery Functions
function showRequestMachineryForm() {
    document.getElementById('requestMachineryFormCard').classList.remove('d-none');
}

function hideRequestMachineryForm() {
    document.getElementById('requestMachineryFormCard').classList.add('d-none');
    document.getElementById('requestMachineryFormCard').querySelector('form').reset();
}

function showPostMachineryForm() {
    document.getElementById('postMachineryFormCard').classList.remove('d-none');
}

function hidePostMachineryForm() {
    document.getElementById('postMachineryFormCard').classList.add('d-none');
    document.getElementById('postMachineryFormCard').querySelector('form').reset();
}

async function createMachineryRequest(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const formData = new FormData();
    formData.append('name', document.getElementById('requestMachineryName').value);
    formData.append('purpose', document.getElementById('requestMachineryUse').value);
    formData.append('phone', document.getElementById('requestMachineryPhone').value);
    
    const imageFile = document.getElementById('requestMachineryImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const result = await apiCall('/machinery-requests', 'POST', formData, true);
        showAlert('Machinery request submitted successfully!', 'success');
        hideRequestMachineryForm();
        
        // Optimize: Load requests in background
        loadMachineryRequests().catch(error => {
            console.error('Background load failed:', error);
        });
        
    } catch (error) {
        console.error('Failed to create machinery request:', error);
        showAlert(`Failed to create machinery request: ${error.message}`, 'danger');
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

async function createMachineryPost(event) {
    event.preventDefault();
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    const submitBtn = getSubmitButton(event.target);
    setLoadingState(submitBtn, true);
    
    const formData = new FormData();
    formData.append('name', document.getElementById('postMachineryName').value);
    formData.append('purpose', document.getElementById('postMachineryUse').value);
    formData.append('price', document.getElementById('postMachineryPrice').value);
    formData.append('phone', document.getElementById('postMachineryPhone').value);
    formData.append('status', document.getElementById('postMachineryStatus').value);
    
    const imageFile = document.getElementById('postMachineryImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const result = await apiCall('/machinery-posts', 'POST', formData, true);
        showAlert('Machinery posted successfully!', 'success');
        hidePostMachineryForm();
        
        // Optimize: Load posts in background
        loadMachineryPosts().catch(error => {
            console.error('Background load failed:', error);
        });
        
    } catch (error) {
        console.error('Failed to create machinery post:', error);
        showAlert(`Failed to create machinery post: ${error.message}`, 'danger');
    } finally {
        isSubmitting = false;
        setLoadingState(submitBtn, false);
    }
}

async function loadMachineryRequests() {
    try {
        const requests = await apiCall('/machinery-requests');
        displayMachineryRequests(requests);
    } catch (error) {
        console.error('Failed to load machinery requests:', error);
    }
}

function displayMachineryRequests(requests) {
    const container = document.getElementById('machineryRequestsContainer');
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-hand-paper fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No machinery requests</h5>
                <p class="text-muted">Be the first to request machinery!</p>
            </div>
        `;
        return;
    }

    requests.forEach(request => {
        const div = document.createElement('div');
        div.className = 'card mb-3 border-0 shadow-sm';
        const imageHtml = request.image ? 
            `<img src="${getImageUrl(request.image)}" class="card-img-top" alt="Machinery" style="height: 200px; object-fit: contain;">` : '';
        
        div.innerHTML = `
            <div class="card-body">
                <div class="d-flex align-items-center mb-3">
                    <img src="${request.user_image ? getImageUrl(request.user_image) : 'https://via.placeholder.com/40'}" 
                         class="profile-img me-3" alt="Profile">
                    <div>
                        <h6 class="mb-0">${request.user_name}</h6>
                        <small class="text-muted">${formatDate(request.created_at)}</small>
                    </div>
                    ${currentUser && currentUser.is_admin ? `
                        <div class="ms-auto">
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteMachineryRequest(${request.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                ${imageHtml}
                <h5 class="text-success mt-3">${request.name}</h5>
                <div class="machinery-info">
                    <span class="machinery-info-item">
                        <i class="fas fa-tools me-1"></i>${request.purpose}
                    </span>
                    ${request.phone ? `<span class="machinery-info-item">
                        <i class="fas fa-phone me-1"></i>${request.phone}
                    </span>` : ''}
                </div>
                <div class="mt-3">
                    <button class="btn btn-success btn-sm" onclick="startChat(${request.user_id})">
                        <i class="fas fa-message me-1"></i>Contact
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function loadMachineryPosts() {
    try {
        const posts = await apiCall('/machinery-posts');
        displayMachineryPosts(posts);
    } catch (error) {
        console.error('Failed to load machinery posts:', error);
    }
}

function displayMachineryPosts(posts) {
    const container = document.getElementById('machineryPostsContainer');
    container.innerHTML = '';

    if (posts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-tractor fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No machinery available</h5>
                <p class="text-muted">Be the first to post machinery for sale/rent!</p>
            </div>
        `;
        return;
    }

    posts.forEach(post => {
        const div = document.createElement('div');
        div.className = 'card mb-3 border-0 shadow-sm';
        const isOwner = currentUser && post.user_id == currentUser.id;
        const statusLabel = post.status === 'available' ? 
            '<span class="badge bg-success ms-2">Available</span>' : 
            '<span class="badge bg-danger ms-2">Out of Stock</span>';
        const statusButton = isOwner ? `
            <button class="btn btn-sm btn-outline-${post.status === 'available' ? 'danger' : 'success'} ms-2" 
                    onclick="toggleMachineryStatus(${post.id}, '${post.status === 'available' ? 'out_of_stock' : 'available'}')">
                Mark as ${post.status === 'available' ? 'Out of Stock' : 'Available'}
            </button>
        ` : '';
        
        const imageHtml = post.image ? 
            `<img src="${getImageUrl(post.image)}" class="card-img-top" alt="Machinery" style="height: 200px; object-fit: cover;">` : '';
        
        div.innerHTML = `
            <div class="card-body">
                <div class="d-flex align-items-center mb-3">
                    <img src="${post.user_image ? getImageUrl(post.user_image) : 'https://via.placeholder.com/40'}" 
                         class="profile-img me-3" alt="Profile">
                    <div>
                        <h6 class="mb-0">${post.user_name}</h6>
                        <small class="text-muted">${formatDate(post.created_at)}</small>
                    </div>
                    <div class="ms-auto">
                        ${currentUser && currentUser.is_admin ? `
                            <button class="btn btn-sm btn-outline-danger me-2" onclick="deleteMachineryPost(${post.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-danger" onclick="showReportModal(${post.id}, ${post.user_id})">
                            <i class="fas fa-flag"></i>
                        </button>
                    </div>
                </div>
                ${imageHtml}
                <h5 class="text-success mt-3">${post.name} ${statusLabel} ${statusButton}</h5>
                <div class="machinery-info">
                    <span class="machinery-info-item">
                        <i class="fas fa-tools me-1"></i>${post.purpose}
                    </span>
                    <span class="machinery-info-item">
                        <i class="fas fa-dollar-sign me-1"></i>₹${post.price}
                    </span>
                    <span class="machinery-info-item">
                        <i class="fas fa-phone me-1"></i>${post.phone}
                    </span>
                </div>
                <div class="mt-3">
                    <button class="btn btn-success btn-sm me-2" onclick="startChat(${post.user_id})">
                        <i class="fas fa-message me-1"></i>Contact
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function toggleMachineryStatus(postId, newStatus) {
    if (isSubmitting) return;
    isSubmitting = true;
    
    // Find the button and disable it
    const button = event.target;
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        await apiCall(`/machinery-posts/${postId}/status`, 'PUT', { status: newStatus });
        showAlert('Status updated successfully!', 'success');
        loadMachineryPosts();
    } catch (error) {
        console.error('Failed to update machinery status:', error);
    } finally {
        isSubmitting = false;
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

async function deleteMachineryRequest(requestId) {
    if (!confirm('Are you sure you want to delete this request?')) return;
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    // Find the button and disable it
    const button = event.target;
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        // Check if we're in admin section and use admin endpoint
        const isAdminSection = document.getElementById('adminSection').classList.contains('d-none') === false;
        const endpoint = isAdminSection ? `/admin/machinery-requests/${requestId}` : `/machinery-requests/${requestId}`;
        
        await apiCall(endpoint, 'DELETE');
        showAlert('Request deleted successfully!', 'success');
        
        // Reload appropriate data based on current section
        if (isAdminSection) {
            await loadAdminRequests();
        } else {
            await loadMachineryRequests();
        }
    } catch (error) {
        console.error('Failed to delete machinery request:', error);
        showAlert(`Failed to delete request: ${error.message}`, 'danger');
    } finally {
        isSubmitting = false;
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

async function deleteMachineryPost(postId) {
    if (!confirm('Are you sure you want to delete this machinery post?')) return;
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    // Find the button and disable it
    const button = event.target;
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        // Check if we're in admin section and use admin endpoint
        const isAdminSection = document.getElementById('adminSection').classList.contains('d-none') === false;
        const endpoint = isAdminSection ? `/admin/machinery-posts/${postId}` : `/machinery-posts/${postId}`;
        
        await apiCall(endpoint, 'DELETE');
        showAlert('Machinery post deleted successfully!', 'success');
        
        // Reload appropriate data based on current section
        if (isAdminSection) {
            await loadAdminMachinery();
        } else {
            await loadMachineryPosts();
        }
    } catch (error) {
        console.error('Failed to delete machinery post:', error);
        showAlert(`Failed to delete machinery post: ${error.message}`, 'danger');
    } finally {
        isSubmitting = false;
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// Admin Functions
function showAdmin() {
    hideAllSections();
    document.getElementById('adminSection').classList.remove('d-none');
    loadAdminStats();
}

async function loadAdminStats() {
    try {
        const stats = await apiCall('/admin/stats');
        document.getElementById('userCount').textContent = stats.users || 0;
        document.getElementById('postCount').textContent = stats.posts || 0;
        document.getElementById('machineryCount').textContent = stats.machinery || 0;
        document.getElementById('requestCount').textContent = stats.requests || 0;
    } catch (error) {
        console.error('Failed to load admin stats:', error);
    }
}

async function loadAdminMachinery() {
    try {
        // Show loading state
        const container = document.getElementById('adminContentContainer');
        container.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-success"></i><p class="mt-2">Loading machinery...</p></div>';
        
        const machinery = await apiCall('/admin/machinery');
        displayAdminMachinery(machinery);
        document.getElementById('adminContentTitle').textContent = 'Manage Machinery';
        
        // Update stats
        await loadAdminStats();
        
    } catch (error) {
        console.error('Failed to load admin machinery:', error);
        const container = document.getElementById('adminContentContainer');
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-exclamation-triangle fa-2x text-warning mb-3"></i>
                <h5 class="text-warning">Failed to load machinery</h5>
                <p class="text-muted">${error.message || 'Please try again later'}</p>
                <button class="btn btn-outline-success" onclick="loadAdminMachinery()">
                    <i class="fas fa-redo me-2"></i>Retry
                </button>
            </div>
        `;
    }
}

function displayAdminMachinery(machinery) {
    const container = document.getElementById('adminContentContainer');
    container.innerHTML = '';

    if (machinery.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No machinery posts found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped admin-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Purpose</th>
                <th>Price</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${machinery.map(post => `
                <tr>
                    <td><strong>${post.name}</strong></td>
                    <td>${post.user_name}</td>
                    <td>${post.purpose || 'N/A'}</td>
                    <td>₹${post.price || 'N/A'}</td>
                    <td>${post.phone || 'N/A'}</td>
                    <td><span class="badge bg-${post.status === 'available' ? 'success' : 'danger'}">${post.status}</span></td>
                    <td>${formatDate(post.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteMachineryPost(${post.id})" title="Delete Machinery">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

async function loadAdminRequests() {
    try {
        // Show loading state
        const container = document.getElementById('adminContentContainer');
        container.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-success"></i><p class="mt-2">Loading requests...</p></div>';
        
        const requests = await apiCall('/admin/machinery-requests');
        displayAdminRequests(requests);
        document.getElementById('adminContentTitle').textContent = 'Manage Requests';
        
        // Update stats
        await loadAdminStats();
        
    } catch (error) {
        console.error('Failed to load admin requests:', error);
        const container = document.getElementById('adminContentContainer');
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-exclamation-triangle fa-2x text-warning mb-3"></i>
                <h5 class="text-warning">Failed to load requests</h5>
                <p class="text-muted">${error.message || 'Please try again later'}</p>
                <button class="btn btn-outline-success" onclick="loadAdminRequests()">
                    <i class="fas fa-redo me-2"></i>Retry
                </button>
            </div>
        `;
    }
}

function displayAdminRequests(requests) {
    const container = document.getElementById('adminContentContainer');
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No machinery requests found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped admin-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Machinery Name</th>
                <th>Requester</th>
                <th>Purpose</th>
                <th>Phone</th>
                <th>Date</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${requests.map(request => `
                <tr>
                    <td><strong>${request.name}</strong></td>
                    <td>${request.user_name}</td>
                    <td>${request.purpose || 'N/A'}</td>
                    <td>${request.phone || 'N/A'}</td>
                    <td>${formatDate(request.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteMachineryRequest(${request.id})" title="Delete Request">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

async function loadAdminUsers() {
    try {
        const users = await apiCall('/admin/users');
        displayAdminUsers(users);
        document.getElementById('adminContentTitle').textContent = 'Manage Users';
    } catch (error) {
        console.error('Failed to load admin users:', error);
    }
}

function displayAdminUsers(users) {
    const container = document.getElementById('adminContentContainer');
    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No users found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${users.map(user => `
                <tr>
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${user.phone || 'N/A'}</td>
                    <td>${user.location || 'N/A'}</td>
                    <td><span class="badge bg-${user.is_verified ? 'success' : 'warning'}">${user.is_verified ? 'Verified' : 'Pending'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

async function loadAdminPosts() {
    try {
        const posts = await apiCall('/admin/posts');
        displayAdminPosts(posts);
        document.getElementById('adminContentTitle').textContent = 'Manage Posts';
    } catch (error) {
        console.error('Failed to load admin posts:', error);
    }
}

function displayAdminPosts(posts) {
    const container = document.getElementById('adminContentContainer');
    container.innerHTML = '';

    if (posts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No posts found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Crop</th>
                <th>Owner</th>
                <th>Area</th>
                <th>Price</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${posts.map(post => `
                <tr>
                    <td>${post.crop_name}</td>
                    <td>${post.user_name}</td>
                    <td>${post.area} acres</td>
                    <td>₹${post.price || 'N/A'}</td>
                    <td><span class="badge bg-${post.sold ? 'danger' : 'success'}">${post.sold ? 'Sold' : 'Available'}</span></td>
                    <td>${formatDate(post.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="deletePost(${post.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    // Find the button and disable it
    const button = event.target;
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        await apiCall(`/admin/users/${userId}`, 'DELETE');
        showAlert('User deleted successfully!', 'success');
        loadAdminUsers();
    } catch (error) {
        console.error('Failed to delete user:', error);
    } finally {
        isSubmitting = false;
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    if (isSubmitting) return;
    isSubmitting = true;
    
    // Find the button and disable it
    const button = event.target;
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        await apiCall(`/admin/posts/${postId}`, 'DELETE');
        showAlert('Post deleted successfully!', 'success');
        loadAdminPosts();
    } catch (error) {
        console.error('Failed to delete post:', error);
    } finally {
        isSubmitting = false;
        button.disabled = false;
        button.innerHTML = originalText;
    }
}
