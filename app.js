const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: './config.env' });

const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
  console.error('Missing required database configuration in config.env');
  console.error('Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
  process.exit(1);
}

const dbPool = mysql.createPool(dbConfig);

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function addNewBook(bookData) {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const { title, author, published_year, genre } = bookData;
    const insertQuery = `
      INSERT INTO books (title, author, published_year, genre)
      VALUES (?, ?, ?, ?)
    `;
    const [result] = await conn.query(insertQuery, [title, author, published_year, genre]);
    
    return {
      success: true,
      message: 'Book created successfully',
      data: {
        id: result.insertId,
        ...bookData,
        created_at: new Date(),
        updated_at: new Date()
      }
    };
  } catch (err) {
    return {
      success: false,
      message: 'Error creating book',
      error: err.message
    };
  } finally {
    if (conn) conn.release();
  }
}

async function getAllBooks() {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const selectQuery = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      ORDER BY created_at DESC
    `;
    const [books] = await conn.query(selectQuery);
    
    return {
      success: true,
      message: 'Books retrieved successfully',
      count: books.length,
      data: books
    };
  } catch (err) {
    return {
      success: false,
      message: 'Error fetching books',
      error: err.message
    };
  } finally {
    if (conn) conn.release();
  }
}

async function getBookById(id) {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const selectQuery = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      WHERE id = ?
    `;
    const [books] = await conn.query(selectQuery, [id]);
    
    if (books.length === 0) {
      return {
        success: false,
        message: 'Book not found',
        data: null
      };
    }
    
    return {
      success: true,
      message: 'Book retrieved successfully',
      data: books[0]
    };
  } catch (err) {
    return {
      success: false,
      message: 'Error fetching book',
      error: err.message
    };
  } finally {
    if (conn) conn.release();
  }
}

async function updateBookById(id, bookData) {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const { title, author, published_year, genre } = bookData;
    const updateQuery = `
      UPDATE books 
      SET title = ?, author = ?, published_year = ?, genre = ?
      WHERE id = ?
    `;
    const [result] = await conn.query(updateQuery, [title, author, published_year, genre, id]);
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: 'Book not found',
        data: null
      };
    }
    
    // Get the updated book data
    return await getBookById(id);
  } catch (err) {
    return {
      success: false,
      message: 'Error updating book',
      error: err.message
    };
  } finally {
    if (conn) conn.release();
  }
}

async function deleteBookById(id) {
  let conn;
  try {
    conn = await dbPool.getConnection();
    
    // First check if book exists
    const bookResponse = await getBookById(id);
    if (!bookResponse.success) {
      return bookResponse;
    }
    
    const deleteQuery = `DELETE FROM books WHERE id = ?`;
    await conn.query(deleteQuery, [id]);
    
    return {
      success: true,
      message: 'Book deleted successfully',
      data: bookResponse.data
    };
  } catch (err) {
    return {
      success: false,
      message: 'Error deleting book',
      error: err.message
    };
  } finally {
    if (conn) conn.release();
  }
}

async function searchBooksByKeyword(searchTerm) {
  let conn;
  try {
    conn = await dbPool.getConnection();
    const searchQuery = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      WHERE title LIKE ? OR author LIKE ? OR genre LIKE ?
      ORDER BY created_at DESC
    `;
    const searchPattern = `%${searchTerm}%`;
    const [books] = await conn.query(searchQuery, [searchPattern, searchPattern, searchPattern]);
    
    return {
      success: true,
      message: 'Search completed successfully',
      count: books.length,
      searchTerm: searchTerm,
      data: books
    };
  } catch (err) {
    return {
      success: false,
      message: 'Error searching books',
      error: err.message
    };
  } finally {
    if (conn) conn.release();
  }
}

app.post('/books', async (req, res) => {
  try {
    const { title, author, published_year, genre } = req.body;
    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author required' });
    }
    
    const result = await addNewBook({ title, author, published_year, genre });
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/books', async (req, res) => {
  try {
    const result = await getAllBooks();
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/books/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ error: 'Search term required' });
    }
    
    const result = await searchBooksByKeyword(q);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/books/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await getBookById(id);
    
    if (result.success) {
      res.json(result.data);
    } else if (result.message === 'Book not found') {
      res.status(404).json({ error: 'Book not found' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/books/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { title, author, published_year, genre } = req.body;
    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author required' });
    }
    
    const result = await updateBookById(id, { title, author, published_year, genre });
    if (result.success) {
      res.json(result.data);
    } else if (result.message === 'Book not found') {
      res.status(404).json({ error: 'Book not found' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/books/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await deleteBookById(id);
    
    if (result.success) {
      res.json({ message: 'Book deleted' });
    } else if (result.message === 'Book not found') {
      res.status(404).json({ error: 'Book not found' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Book API is running smoothly',
    version: '1.0.0',
    developer: 'Phone',
    github: 'https://github.com/rapterxcode/bookstore-api',
    endpoints: {
      books: {
        getAll: 'GET /books',
        getById: 'GET /books/:id',
        create: 'POST /books',
        update: 'PUT /books/:id',
        delete: 'DELETE /books/:id',
        search: 'GET /books/search?q=BookName'
      }
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`================================================================================`);
  console.log(`Developed by Phone : https://github.com/rapterxcode/bookstore-api`);
  console.log(`================================================================================`);

  console.log(`Server running on port ${PORT}`);
  console.log(`Book API is ready at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`================================================================================`);
});
