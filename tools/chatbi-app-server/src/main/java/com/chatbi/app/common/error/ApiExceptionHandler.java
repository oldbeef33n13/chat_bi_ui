package com.chatbi.app.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(NotFoundException.class)
  public ResponseEntity<ApiErrorResponse> handleNotFound(NotFoundException ex, HttpServletRequest request) {
    return errorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), request.getRequestURI());
  }

  @ExceptionHandler(ConflictException.class)
  public ResponseEntity<ApiErrorResponse> handleConflict(ConflictException ex, HttpServletRequest request) {
    return errorResponse(HttpStatus.CONFLICT, ex.getMessage(), request.getRequestURI());
  }

  @ExceptionHandler({
    BadRequestException.class,
    MethodArgumentNotValidException.class,
    ConstraintViolationException.class,
    IllegalArgumentException.class
  })
  public ResponseEntity<ApiErrorResponse> handleBadRequest(Exception ex, HttpServletRequest request) {
    return errorResponse(HttpStatus.BAD_REQUEST, ex.getMessage(), request.getRequestURI());
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
    return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage(), request.getRequestURI());
  }

  private ResponseEntity<ApiErrorResponse> errorResponse(HttpStatus status, String message, String path) {
    return ResponseEntity.status(status).body(
      new ApiErrorResponse(Instant.now(), status.value(), status.getReasonPhrase(), message, path)
    );
  }
}
